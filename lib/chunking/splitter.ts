import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface RawSection {
  text: string;
  page?: number;
  /** Nearest markdown heading this section sits under, if any. */
  heading?: string;
}

export interface Chunked {
  content: string;
  page?: number;
  index: number;
  heading?: string;
}

/**
 * Split parsed document text into overlapping chunks.
 *
 * Strategy: RecursiveCharacterTextSplitter walks a hierarchy of separators
 * (paragraph -> sentence -> word) so chunks rarely break mid-thought. A 200-char
 * overlap preserves cross-boundary context for retrieval. Each chunk inherits
 * its section's page + heading so it can be contextualized before embedding.
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
      out.push({ content: p, page: sec.page, heading: sec.heading, index: idx++ });
    }
  }
  return out;
}

/**
 * Split markdown into sections keyed by their nearest heading. Heading text is
 * captured as metadata (not kept in the body) so it can be prepended as
 * retrieval context. Falls back to a single section when there are no headings.
 */
export function splitMarkdownSections(text: string): RawSection[] {
  const lines = text.split(/\r?\n/);
  const sections: RawSection[] = [];
  let heading: string | undefined;
  let buf: string[] = [];

  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) sections.push({ text: t, heading });
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (m) {
      flush();
      heading = m[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();

  return sections.length ? sections : [{ text: text.trim() }];
}

/**
 * A compact context label for a chunk: document name, nearest heading, and page.
 * Prepended to chunk text *before embedding only* ("contextual retrieval") so a
 * fragment like "...rose 40%..." still embeds near "Revenue, Q3". The stored
 * chunk content stays raw, keeping citations clean.
 */
export function contextHeader(docName: string, c: Pick<Chunked, "heading" | "page">): string {
  let h = c.heading ? `${docName} — ${c.heading}` : docName;
  if (c.page) h += ` (p.${c.page})`;
  return h;
}

export function contextualize(docName: string, c: Chunked): string {
  return `${contextHeader(docName, c)}\n\n${c.content}`;
}
