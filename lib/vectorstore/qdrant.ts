import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { DocumentChunk, RetrievedChunk, UploadedDoc } from "@/types";
import type { VectorStore } from "@/lib/vectorstore/types";

// One collection per embedding dimension (e.g. nbrag_1536 for OpenAI, nbrag_3072
// for Gemini). A Qdrant collection has a fixed vector size, so splitting by dim
// both supports mixed providers and naturally enforces the dimension-match guard.
const PREFIX = "nbrag_";
const collectionFor = (dim: number) => `${PREFIX}${dim}`;

// Document metadata lives in its own collection. Qdrant requires a vector per
// point, so meta points carry a throwaway 1-d vector — they're never searched,
// only scrolled/filtered by payload.
const META = "nbrag_docs";
const META_DIM = 1;

let _client: QdrantClient | null = null;

/** Lazily build a singleton client from env. Returns null if not configured. */
export function qdrantClient(): QdrantClient | null {
  if (_client) return _client;
  const url = process.env.QDRANT_URL?.trim();
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  if (!url) return null;
  _client = new QdrantClient({ url, apiKey, checkCompatibility: false });
  return _client;
}

// Track which collections we've already ensured this process, to skip the
// round-trip on every upsert.
const _ensured = new Set<string>();

interface ChunkPayload {
  sessionId: string;
  chunkId: string;
  docId: string;
  docName: string;
  content: string;
  page?: number;
  index: number;
  ts: number; // ingest time (ms) — drives GC
}

interface DocPayload extends UploadedDoc {
  sessionId: string;
  ts: number;
}

async function ensureIndexes(client: QdrantClient, name: string, fields: string[]) {
  for (const field of fields) {
    try {
      await client.createPayloadIndex(name, {
        field_name: field,
        field_schema: field === "ts" ? "integer" : "keyword",
      });
    } catch {
      /* index already present */
    }
  }
}

/**
 * Qdrant-backed vector store. Persistent and shared across serverless instances.
 * Multi-tenant: every point carries a `sessionId` payload and all reads/writes
 * filter on it, so one cloud cluster safely serves all sessions. Document
 * metadata is persisted too, so a cold start loses nothing.
 */
export class QdrantVectorStore implements VectorStore {
  constructor(
    private readonly client: QdrantClient,
    private readonly sessionId: string
  ) {}

  private sessionFilter(docIds?: string[]) {
    const must: Array<Record<string, unknown>> = [
      { key: "sessionId", match: { value: this.sessionId } },
    ];
    if (docIds && docIds.length) {
      must.push({ key: "docId", match: { any: docIds } });
    }
    return { must };
  }

  private async ensureCollection(dim: number): Promise<string> {
    const name = collectionFor(dim);
    if (_ensured.has(name)) return name;
    if (!(await this.client.collectionExists(name)).exists) {
      try {
        await this.client.createCollection(name, {
          vectors: { size: dim, distance: "Cosine" },
        });
      } catch {
        // Concurrent creation from another instance — fine, it now exists.
      }
      await ensureIndexes(this.client, name, ["sessionId", "docId", "ts"]);
    }
    _ensured.add(name);
    return name;
  }

  private async ensureMeta(): Promise<string> {
    if (_ensured.has(META)) return META;
    if (!(await this.client.collectionExists(META)).exists) {
      try {
        await this.client.createCollection(META, {
          vectors: { size: META_DIM, distance: "Cosine" },
        });
      } catch {
        /* concurrent creation */
      }
      await ensureIndexes(this.client, META, ["sessionId", "docId", "ts"]);
    }
    _ensured.add(META);
    return META;
  }

  /** Collections that currently exist, so cross-dim ops can fan out. */
  private async sessionCollections(): Promise<string[]> {
    const { collections } = await this.client.getCollections();
    return collections
      .map((c) => c.name)
      .filter((n) => n.startsWith(PREFIX) && n !== META);
  }

  async add(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    // All chunks in one ingest share a provider/dimension.
    const dim = chunks[0].embedding.length;
    const name = await this.ensureCollection(dim);
    const ts = Date.now();

    const points = chunks.map((c) => ({
      id: randomUUID(),
      vector: c.embedding,
      payload: {
        sessionId: this.sessionId,
        chunkId: c.id,
        docId: c.docId,
        docName: c.docName,
        content: c.content,
        page: c.page,
        index: c.index,
        ts,
      } satisfies ChunkPayload,
    }));

    // Chunk the upsert to keep request bodies sane on large docs.
    const BATCH = 100;
    for (let i = 0; i < points.length; i += BATCH) {
      await this.client.upsert(name, { wait: true, points: points.slice(i, i + BATCH) });
    }
  }

  async removeByDoc(docId: string): Promise<number> {
    let removed = 0;
    const filter = { must: [
      { key: "sessionId", match: { value: this.sessionId } },
      { key: "docId", match: { value: docId } },
    ] };
    for (const name of await this.sessionCollections()) {
      const before = await this.client.count(name, { filter, exact: true });
      await this.client.delete(name, { wait: true, filter });
      removed += before.count;
    }
    await this.deleteDoc(docId);
    return removed;
  }

  async clear(): Promise<void> {
    const filter = { must: [{ key: "sessionId", match: { value: this.sessionId } }] };
    for (const name of [...(await this.sessionCollections()), META]) {
      await this.client.delete(name, { wait: true, filter });
    }
  }

  async size(): Promise<number> {
    let total = 0;
    const filter = { must: [{ key: "sessionId", match: { value: this.sessionId } }] };
    for (const name of await this.sessionCollections()) {
      const { count } = await this.client.count(name, { filter, exact: true });
      total += count;
    }
    return total;
  }

  async similaritySearch(
    queryEmbedding: number[],
    topK = 5,
    docIds?: string[]
  ): Promise<RetrievedChunk[]> {
    // Query only the collection matching the query's dimension — the natural
    // analogue of the in-memory dimension guard.
    const name = collectionFor(queryEmbedding.length);
    if (!(await this.client.collectionExists(name)).exists) return [];

    const res = await this.client.search(name, {
      vector: queryEmbedding,
      limit: topK,
      filter: this.sessionFilter(docIds),
      with_payload: true,
    });

    return res.map((p) => {
      const pl = p.payload as unknown as ChunkPayload;
      const chunk: DocumentChunk = {
        id: pl.chunkId,
        docId: pl.docId,
        docName: pl.docName,
        content: pl.content,
        page: pl.page,
        index: pl.index,
        embedding: [], // not needed downstream; omitted to save payload weight
      };
      return { chunk, score: p.score };
    });
  }

  async sampleChunks(limit: number): Promise<DocumentChunk[]> {
    const out: DocumentChunk[] = [];
    const seen = new Set<string>();
    const filter = { must: [{ key: "sessionId", match: { value: this.sessionId } }] };

    for (const name of await this.sessionCollections()) {
      const res = await this.client.scroll(name, {
        filter,
        limit: 50,
        with_payload: true,
        with_vector: false,
      });
      for (const p of res.points) {
        const pl = p.payload as unknown as ChunkPayload;
        if (seen.has(pl.docId)) continue;
        seen.add(pl.docId);
        out.push({
          id: pl.chunkId,
          docId: pl.docId,
          docName: pl.docName,
          content: pl.content,
          page: pl.page,
          index: pl.index,
          embedding: [],
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async putDoc(doc: UploadedDoc): Promise<void> {
    const name = await this.ensureMeta();
    await this.client.upsert(name, {
      wait: true,
      points: [
        {
          id: randomUUID(),
          vector: [0],
          payload: { ...doc, sessionId: this.sessionId, ts: Date.now() } satisfies DocPayload,
        },
      ],
    });
  }

  async listDocs(): Promise<UploadedDoc[]> {
    if (!(await this.client.collectionExists(META)).exists) return [];
    const res = await this.client.scroll(META, {
      filter: { must: [{ key: "sessionId", match: { value: this.sessionId } }] },
      limit: 256,
      with_payload: true,
      with_vector: false,
    });
    return res.points
      .map((p) => {
        const { sessionId: _s, ts: _t, ...doc } = p.payload as unknown as DocPayload;
        return doc as UploadedDoc;
      })
      .sort((a, b) => a.uploadedAt - b.uploadedAt);
  }

  async deleteDoc(docId: string): Promise<void> {
    if (!(await this.client.collectionExists(META)).exists) return;
    await this.client.delete(META, {
      wait: true,
      filter: { must: [
        { key: "sessionId", match: { value: this.sessionId } },
        { key: "docId", match: { value: docId } },
      ] },
    });
  }
}

/**
 * Delete points older than `maxAgeMs` across all nbrag collections. Qdrant has
 * no native TTL, so this is the persistence-layer analogue of the in-memory
 * session eviction. Age is measured from ingest time (the `ts` payload), not
 * last access — simpler and avoids a write on every query. Best-effort: errors
 * are swallowed so a GC hiccup never breaks a request.
 */
export async function gcQdrant(maxAgeMs: number): Promise<void> {
  const client = qdrantClient();
  if (!client) return;
  const cutoff = Date.now() - maxAgeMs;
  const filter = { must: [{ key: "ts", range: { lt: cutoff } }] };
  try {
    const { collections } = await client.getCollections();
    const targets = collections.map((c) => c.name).filter((n) => n.startsWith(PREFIX));
    for (const name of targets) {
      try {
        await client.delete(name, { wait: false, filter });
      } catch {
        /* per-collection failure — skip */
      }
    }
  } catch {
    /* listing failed — skip this GC pass */
  }
}
