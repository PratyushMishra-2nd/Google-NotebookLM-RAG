import type { DocumentChunk, RetrievedChunk, UploadedDoc } from "@/types";

/**
 * Async vector store contract. Both the in-memory fallback and the Qdrant-backed
 * store implement this so the rest of the pipeline is storage-agnostic. Document
 * metadata is owned by the store too, so persistence covers it as well.
 */
export interface VectorStore {
  add(chunks: DocumentChunk[]): Promise<void>;
  removeByDoc(docId: string): Promise<number>;
  similaritySearch(
    queryEmbedding: number[],
    topK?: number,
    docIds?: string[]
  ): Promise<RetrievedChunk[]>;
  size(): Promise<number>;
  clear(): Promise<void>;
  /** First chunk of each distinct document, up to `limit` — used for cheap sampling. */
  sampleChunks(limit: number): Promise<DocumentChunk[]>;

  // Document metadata.
  putDoc(doc: UploadedDoc): Promise<void>;
  listDocs(): Promise<UploadedDoc[]>;
  deleteDoc(docId: string): Promise<void>;
}
