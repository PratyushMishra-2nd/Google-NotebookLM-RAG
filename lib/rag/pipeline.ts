import { nanoid } from "nanoid";
import { chunkSections, contextualize } from "@/lib/chunking/splitter";
import { embedDocuments, generateText, streamText } from "@/lib/llm/client";
import { parsePdf, parseTxt } from "@/lib/rag/parse";
import { retrieveContext } from "@/lib/rag/retrieve";
import { getSession } from "@/lib/store";
import type { Citation, DocumentChunk, RetrievedChunk, UploadedDoc } from "@/types";

const REFUSAL =
  "The uploaded document does not contain enough information to answer this question.";

export async function ingestFile(
  sessionId: string,
  file: { name: string; size: number; mime: string; buffer: Buffer },
  apiKey?: string
): Promise<UploadedDoc> {
  const isPdf = file.mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isMd = file.mime === "text/markdown" || /\.md$/i.test(file.name);
  const isTxt = file.mime === "text/plain" || isMd || /\.txt$/i.test(file.name);

  if (!isPdf && !isTxt) throw new Error("Unsupported file type — upload PDF or TXT");
  if (file.size === 0) throw new Error("File is empty");
  if (file.size > 15 * 1024 * 1024) throw new Error("File too large (15MB max)");

  let sections;
  let pages: number | undefined;
  if (isPdf) {
    const r = await parsePdf(file.buffer);
    sections = r.sections;
    pages = r.pages;
  } else {
    sections = parseTxt(file.buffer, isMd).sections;
  }

  if (!sections.length || sections.every((s) => !s.text.trim())) {
    throw new Error("Document appears empty after parsing");
  }

  const chunked = await chunkSections(sections);
  if (!chunked.length) throw new Error("No usable content extracted");

  const docId = nanoid(10);
  const docName = file.name;

  // Embed each chunk WITH its context label (doc + heading + page) so isolated
  // fragments land near their topic in vector space. Stored content stays raw.
  const embeddings = await embedDocuments(
    chunked.map((c) => contextualize(docName, c)),
    apiKey
  );
  const records: DocumentChunk[] = chunked.map((c, i) => ({
    id: `${docId}:${i}`,
    docId,
    docName,
    content: c.content,
    page: c.page,
    index: c.index,
    embedding: embeddings[i],
  }));

  const session = getSession(sessionId);
  await session.store.add(records);

  const doc: UploadedDoc = {
    id: docId,
    name: docName,
    size: file.size,
    pages,
    chunkCount: records.length,
    uploadedAt: Date.now(),
  };
  await session.store.putDoc(doc);
  return doc;
}

export function listDocs(sessionId: string): Promise<UploadedDoc[]> {
  return getSession(sessionId).store.listDocs();
}

export async function removeDoc(sessionId: string, docId: string): Promise<boolean> {
  const removed = await getSession(sessionId).store.removeByDoc(docId);
  return removed > 0;
}

function buildPrompt(question: string, retrieved: RetrievedChunk[]): string {
  const blocks = retrieved
    .map((r, i) => {
      const tag = r.chunk.page ? `${r.chunk.docName}, p.${r.chunk.page}` : r.chunk.docName;
      return `[${i + 1}] (${tag})\n${r.chunk.content}`;
    })
    .join("\n\n---\n\n");

  return [
    "You are a precise research assistant answering strictly from the supplied excerpts.",
    "Rules:",
    "- Use ONLY information present in the excerpts. Never use outside knowledge.",
    `- If the excerpts do not contain enough information, reply EXACTLY: ${REFUSAL}`,
    "- Cite supporting excerpts inline as [1], [2], [3] matching the bracketed numbers.",
    "- Prefer concise, structured answers. Quote sparingly.",
    "",
    "EXCERPTS:",
    blocks,
    "",
    `QUESTION: ${question}`,
    "ANSWER:",
  ].join("\n");
}

export interface AnswerOpts {
  docIds?: string[];
  topK?: number;
  fetchK?: number;
  apiKey?: string;
  rewrite?: boolean;
  rerank?: boolean;
}

function toCitations(retrieved: RetrievedChunk[]): Citation[] {
  return retrieved.map((r) => ({
    docId: r.chunk.docId,
    docName: r.chunk.docName,
    page: r.chunk.page,
    snippet: r.chunk.content.slice(0, 240),
    score: r.score,
  }));
}

export async function answerQuestion(
  sessionId: string,
  question: string,
  opts?: AnswerOpts
): Promise<{ answer: string; citations: Citation[] }> {
  const session = getSession(sessionId);
  if ((await session.store.size()) === 0) {
    return { answer: REFUSAL, citations: [] };
  }

  const { retrieved } = await retrieveContext(session.store, question, opts);

  if (retrieved.length === 0) {
    return { answer: REFUSAL, citations: [] };
  }

  const prompt = buildPrompt(question, retrieved);
  const answer = await generateText(prompt, opts?.apiKey, { temperature: 0.1, maxTokens: 1024 });

  return { answer, citations: toCitations(retrieved) };
}

export async function streamAnswer(
  sessionId: string,
  question: string,
  opts?: AnswerOpts
): Promise<{ stream: ReadableStream<Uint8Array>; citations: Citation[] }> {
  const session = getSession(sessionId);
  const encoder = new TextEncoder();

  if ((await session.store.size()) === 0) {
    return {
      citations: [],
      stream: new ReadableStream({
        start(c) { c.enqueue(encoder.encode(REFUSAL)); c.close(); },
      }),
    };
  }

  const { retrieved } = await retrieveContext(session.store, question, opts);

  if (retrieved.length === 0) {
    return {
      citations: [],
      stream: new ReadableStream({
        start(c) { c.enqueue(encoder.encode(REFUSAL)); c.close(); },
      }),
    };
  }

  const citations = toCitations(retrieved);
  const prompt = buildPrompt(question, retrieved);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const t of streamText(prompt, opts?.apiKey, { temperature: 0.1, maxTokens: 1024 })) {
          if (t) controller.enqueue(encoder.encode(t));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[stream error: ${(err as Error).message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return { stream, citations };
}

export const REFUSAL_TEXT = REFUSAL;
