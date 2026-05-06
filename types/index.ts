export interface DocumentChunk {
  id: string;
  docId: string;
  docName: string;
  content: string;
  page?: number;
  index: number;
  embedding: number[];
}

export interface UploadedDoc {
  id: string;
  name: string;
  size: number;
  pages?: number;
  chunkCount: number;
  uploadedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: number;
}

export interface Citation {
  docId: string;
  docName: string;
  page?: number;
  snippet: string;
  score: number;
}

export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
}
