import { nanoid } from "nanoid";
import { chunkSections } from "@/lib/chunking/splitter";
import { embedTexts, embedQuery, gemini, CHAT_MODEL } from "@/lib/gemini/client";
import { parsePdf, parseTxt } from "@/lib/rag/parse";
import { getSession } from "@/lib/store";
import type { Citation, DocumentChunk, RetrievedChunk, UploadedDoc } from "@/types";

const REFUSAL =
  "The uploaded document does not contain enough information to answer this question.";

export async function ingestFile(
  sessionId: string,
  file: { name: string; size: number; mime: string; buffer: Buffer }
): Promise<UploadedDoc> {
  const isPdf = file.mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isTxt =
    file.mime === "text/plain" ||
    file.mime === "text/markdown" ||
    /\.(txt|md)$/i.test(file.name);

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
    sections = parseTxt(file.buffer).sections;
  }

  if (!sections.length || sections.every((s) => !s.text.trim())) {
    throw new Error("Document appears empty after parsing");
  }

  const chunked = await chunkSections(sections);
  if (!chunked.length) throw new Error("No usable content extracted");

  const embeddings = await embedTexts(chunked.map((c) => c.content));

  const docId = nanoid(10);
  const docName = file.name;
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
  session.store.add(records);

  const doc: UploadedDoc = {
    id: docId,
    name: docName,
    size: file.size,
    pages,
    chunkCount: records.length,
    uploadedAt: Date.now(),
  };
  session.docs.set(docId, doc);
  return doc;
}

export function listDocs(sessionId: string): UploadedDoc[] {
  return Array.from(getSession(sessionId).docs.values()).sort(
    (a, b) => a.uploadedAt - b.uploadedAt
  );
}

export function removeDoc(sessionId: string, docId: string): boolean {
  const s = getSession(sessionId);
  s.store.removeByDoc(docId);
  return s.docs.delete(docId);
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

export async function answerQuestion(
  sessionId: string,
  question: string,
  opts?: { docIds?: string[]; topK?: number }
): Promise<{ answer: string; citations: Citation[] }> {
  const session = getSession(sessionId);
  if (session.store.size() === 0) {
    return { answer: REFUSAL, citations: [] };
  }

  const qVec = await embedQuery(question);
  const retrieved = session.store.similaritySearch(qVec, opts?.topK ?? 3, opts?.docIds);

  if (retrieved.length === 0 || retrieved[0].score < 0.35) {
    return { answer: REFUSAL, citations: [] };
  }

  const model = gemini().getGenerativeModel({
    model: CHAT_MODEL,
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
  });

  const prompt = buildPrompt(question, retrieved);
  const res = await model.generateContent(prompt);
  const answer = res.response.text().trim();

  const citations: Citation[] = retrieved.map((r) => ({
    docId: r.chunk.docId,
    docName: r.chunk.docName,
    page: r.chunk.page,
    snippet: r.chunk.content.slice(0, 240),
    score: r.score,
  }));

  return { answer, citations };
}

export async function streamAnswer(
  sessionId: string,
  question: string,
  opts?: { docIds?: string[]; topK?: number }
): Promise<{ stream: ReadableStream<Uint8Array>; citations: Citation[] }> {
  const session = getSession(sessionId);
  const encoder = new TextEncoder();

  if (session.store.size() === 0) {
    return {
      citations: [],
      stream: new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(REFUSAL));
          c.close();
        },
      }),
    };
  }

  const qVec = await embedQuery(question);
  const retrieved = session.store.similaritySearch(qVec, opts?.topK ?? 3, opts?.docIds);

  if (retrieved.length === 0 || retrieved[0].score < 0.35) {
    return {
      citations: [],
      stream: new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(REFUSAL));
          c.close();
        },
      }),
    };
  }

  const citations: Citation[] = retrieved.map((r) => ({
    docId: r.chunk.docId,
    docName: r.chunk.docName,
    page: r.chunk.page,
    snippet: r.chunk.content.slice(0, 240),
    score: r.score,
  }));

  const model = gemini().getGenerativeModel({
    model: CHAT_MODEL,
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
  });

  const prompt = buildPrompt(question, retrieved);
  const result = await model.generateContentStream(prompt);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const t = chunk.text();
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
