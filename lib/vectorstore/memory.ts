import type { DocumentChunk, RetrievedChunk, UploadedDoc } from "@/types";
import type { VectorStore } from "@/lib/vectorstore/types";

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Pure in-memory vector index. Lives only in module-scope memory of the
 * current serverless instance — no external DB, fully ephemeral. Used as a
 * fallback when no Qdrant connection is configured.
 *
 * Methods are async to match the {@link VectorStore} contract shared with the
 * Qdrant-backed store; the work itself is synchronous.
 */
export class MemoryVectorStore implements VectorStore {
  private chunks: DocumentChunk[] = [];
  private docs = new Map<string, UploadedDoc>();

  async add(chunks: DocumentChunk[]): Promise<void> {
    this.chunks.push(...chunks);
  }

  async removeByDoc(docId: string): Promise<number> {
    const before = this.chunks.length;
    this.chunks = this.chunks.filter((c) => c.docId !== docId);
    this.docs.delete(docId);
    return before - this.chunks.length;
  }

  async clear(): Promise<void> {
    this.chunks = [];
    this.docs.clear();
  }

  async size(): Promise<number> {
    return this.chunks.length;
  }

  async similaritySearch(
    queryEmbedding: number[],
    topK = 5,
    docIds?: string[]
  ): Promise<RetrievedChunk[]> {
    const pool = docIds && docIds.length
      ? this.chunks.filter((c) => docIds.includes(c.docId))
      : this.chunks;

    // Guard against provider/model mismatch: embeddings of differing dimension
    // (e.g. docs indexed with Gemini, query made with OpenAI) are not comparable.
    const dim = queryEmbedding.length;
    const comparable = pool.filter((c) => c.embedding.length === dim);

    const scored = comparable.map((chunk) => ({
      chunk,
      score: cosine(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async sampleChunks(limit: number): Promise<DocumentChunk[]> {
    const out: DocumentChunk[] = [];
    const seen = new Set<string>();
    for (const c of this.chunks) {
      if (seen.has(c.docId)) continue;
      seen.add(c.docId);
      out.push(c);
      if (out.length >= limit) break;
    }
    return out;
  }

  async putDoc(doc: UploadedDoc): Promise<void> {
    this.docs.set(doc.id, doc);
  }

  async listDocs(): Promise<UploadedDoc[]> {
    return Array.from(this.docs.values()).sort((a, b) => a.uploadedAt - b.uploadedAt);
  }

  async deleteDoc(docId: string): Promise<void> {
    this.docs.delete(docId);
  }
}
