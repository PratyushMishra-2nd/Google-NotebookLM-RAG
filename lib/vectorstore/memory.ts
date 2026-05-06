import type { DocumentChunk, RetrievedChunk } from "@/types";

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
 * current serverless instance — no external DB, fully ephemeral.
 */
export class MemoryVectorStore {
  private chunks: DocumentChunk[] = [];

  add(chunks: DocumentChunk[]): void {
    this.chunks.push(...chunks);
  }

  removeByDoc(docId: string): number {
    const before = this.chunks.length;
    this.chunks = this.chunks.filter((c) => c.docId !== docId);
    return before - this.chunks.length;
  }

  clear(): void {
    this.chunks = [];
  }

  size(): number {
    return this.chunks.length;
  }

  similaritySearch(queryEmbedding: number[], topK = 3, docIds?: string[]): RetrievedChunk[] {
    const pool = docIds && docIds.length
      ? this.chunks.filter((c) => docIds.includes(c.docId))
      : this.chunks;

    const scored = pool.map((chunk) => ({
      chunk,
      score: cosine(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
