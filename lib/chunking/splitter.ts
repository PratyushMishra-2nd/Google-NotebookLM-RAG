import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface RawSection {
  text: string;
  page?: number;
}

export interface Chunked {
  content: string;
  page?: number;
  index: number;
}

/**
 * Split parsed document text into overlapping chunks.
 *
 * Strategy: RecursiveCharacterTextSplitter walks a hierarchy of separators
 * (paragraph -> sentence -> word) so chunks rarely break mid-thought. A 200-char
 * overlap preserves cross-boundary context for retrieval.
 */
export async function chunkSections(sections: RawSection[]): Promise<Chunked[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const out: Chunked[] = [];
  let idx = 0;
  for (const sec of sections) {
    const trimmed = sec.text.trim();
    if (!trimmed) continue;
    const pieces = await splitter.splitText(trimmed);
    for (const p of pieces) {
      out.push({ content: p, page: sec.page, index: idx++ });
    }
  }
  return out;
}
