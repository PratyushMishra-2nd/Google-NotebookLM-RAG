import { embedQuery, generateText } from "@/lib/llm/client";
import type { RetrievedChunk } from "@/types";
import type { VectorStore } from "@/lib/vectorstore/types";

// How many chunks to pull from the vector store before reranking, and how many
// to keep after. Fetch wide (cheap, in-memory cosine) then let the LLM judge
// narrow to the few that actually answer the question.
const FETCH_K = 20;
const FINAL_K = 5;

export interface RetrieveOpts {
  docIds?: string[];
  topK?: number; // final count after rerank
  fetchK?: number; // candidates pulled before rerank
  apiKey?: string;
  rewrite?: boolean; // default true
  rerank?: boolean; // default true
}

export interface RetrieveResult {
  retrieved: RetrievedChunk[];
  /** The query actually embedded (rewritten form, or original on fallback). */
  rewritten: string;
}

/**
 * Rewrite a raw user query for retrieval: fix typos, normalize grammar, and
 * enrich with clarifying terms so the embedding lands closer to the relevant
 * chunks. Uses the chat model (flash-lite tier) at temp 0.
 *
 * Intent-drift guard: the caller embeds BOTH the original and the rewrite, so a
 * bad rewrite can only add candidates, never replace the user's real intent.
 * On any failure we silently fall back to the original query.
 */
export async function rewriteQuery(question: string, apiKey?: string): Promise<string> {
  const prompt = [
    "You rewrite search queries for a document-retrieval system.",
    "Fix spelling and grammar. Expand abbreviations. Add a few clarifying or synonymous terms that improve semantic search.",
    "Do NOT answer the question. Do NOT change its meaning. Do NOT invent domain-specific codes or names.",
    "Return ONLY the rewritten query on a single line — no quotes, no prose, no prefix.",
    "",
    `QUERY: ${question}`,
  ].join("\n");

  try {
    const raw = await generateText(prompt, apiKey, { temperature: 0, maxTokens: 128 });
    const cleaned = raw.replace(/^["'`\s]+|["'`\s]+$/g, "").split("\n")[0]?.trim();
    return cleaned && cleaned.length > 1 ? cleaned : question;
  } catch {
    return question;
  }
}

/**
 * LLM-as-judge rerank. Scores each candidate chunk 0-10 for how well it helps
 * answer the question, then returns the top `topN` by judged score (vector
 * score breaks ties). One batched LLM call. On parse/LLM failure, falls back to
 * the original vector order.
 */
export async function rerank(
  question: string,
  candidates: RetrievedChunk[],
  topN: number,
  apiKey?: string
): Promise<RetrievedChunk[]> {
  if (candidates.length <= topN) return candidates;

  const blocks = candidates
    .map((r, i) => `[${i}]\n${r.chunk.content.slice(0, 500)}`)
    .join("\n\n---\n\n");

  const prompt = [
    "Score how useful each excerpt is for answering the question, from 0 (irrelevant) to 10 (directly answers it).",
    "Return ONLY a JSON array of objects like [{\"i\":0,\"score\":7}, ...]. One entry per excerpt index. No prose.",
    "",
    `QUESTION: ${question}`,
    "",
    "EXCERPTS:",
    blocks,
  ].join("\n");

  try {
    const raw = await generateText(prompt, apiKey, { temperature: 0, maxTokens: 512 });
    const txt = raw.replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(txt) as Array<{ i: number; score: number }>;

    const scoreById = new Map<number, number>();
    for (const p of parsed) {
      if (typeof p?.i === "number" && typeof p?.score === "number") scoreById.set(p.i, p.score);
    }
    if (scoreById.size === 0) return candidates.slice(0, topN);

    return candidates
      .map((r, i) => ({ r, judge: scoreById.get(i) ?? -1, vec: r.score }))
      .sort((a, b) => b.judge - a.judge || b.vec - a.vec)
      .slice(0, topN)
      .map((x) => x.r);
  } catch {
    // Judge unavailable or unparseable — keep vector ranking.
    return candidates.slice(0, topN);
  }
}

/**
 * Full retrieval: rewrite → embed original + rewrite → wide vector search →
 * merge/dedupe candidates → LLM rerank → top-K. Each stage degrades gracefully
 * to plain vector search if its LLM step fails.
 */
export async function retrieveContext(
  store: VectorStore,
  question: string,
  opts: RetrieveOpts = {}
): Promise<RetrieveResult> {
  const finalK = opts.topK ?? FINAL_K;
  const fetchK = opts.fetchK ?? FETCH_K;
  const doRewrite = opts.rewrite !== false;
  const doRerank = opts.rerank !== false;

  const rewritten = doRewrite ? await rewriteQuery(question, opts.apiKey) : question;

  // Embed both forms when the rewrite actually differs — protects user intent.
  const queries = rewritten !== question ? [question, rewritten] : [question];
  const vecs = await Promise.all(queries.map((q) => embedQuery(q, opts.apiKey)));

  // Merge candidates from each query, dedupe by chunk id keeping the best score.
  const best = new Map<string, RetrievedChunk>();
  const hits = await Promise.all(vecs.map((vec) => store.similaritySearch(vec, fetchK, opts.docIds)));
  for (const list of hits) {
    for (const r of list) {
      const prev = best.get(r.chunk.id);
      if (!prev || r.score > prev.score) best.set(r.chunk.id, r);
    }
  }

  const candidates = Array.from(best.values()).sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return { retrieved: [], rewritten };

  const retrieved = doRerank
    ? await rerank(rewritten, candidates, finalK, opts.apiKey)
    : candidates.slice(0, finalK);

  return { retrieved, rewritten };
}
