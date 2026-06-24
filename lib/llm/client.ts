import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import OpenAI from "openai";

export type Provider = "gemini" | "openai";

// Model defaults per provider — override via env.
const GEMINI_CHAT = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite-preview";
const GEMINI_EMBED = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
const OPENAI_CHAT = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const OPENAI_EMBED = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";

export interface GenOpts {
  temperature?: number;
  maxTokens?: number;
}

/** Pick provider from a key's shape. OpenAI keys start with `sk-`. */
export function providerOf(apiKey: string): Provider {
  return apiKey.startsWith("sk-") ? "openai" : "gemini";
}

/**
 * Resolve the active key + provider. Prefers the user-supplied key, then env.
 * Both GOOGLE_API_KEY and OPENAI_API_KEY are honored as server-side fallbacks.
 */
function resolve(apiKey?: string): { provider: Provider; key: string } {
  if (apiKey && apiKey.trim()) {
    const key = apiKey.trim();
    return { provider: providerOf(key), key };
  }
  if (process.env.OPENAI_API_KEY) return { provider: "openai", key: process.env.OPENAI_API_KEY };
  if (process.env.GOOGLE_API_KEY) return { provider: "gemini", key: process.env.GOOGLE_API_KEY };
  throw new Error(
    "No API key — set GOOGLE_API_KEY or OPENAI_API_KEY, or pass your key in the UI."
  );
}

// Per-key client caches — avoid reinstantiating on every call.
const _gemini = new Map<string, GoogleGenerativeAI>();
const _openai = new Map<string, OpenAI>();

function geminiClient(key: string): GoogleGenerativeAI {
  if (!_gemini.has(key)) _gemini.set(key, new GoogleGenerativeAI(key));
  return _gemini.get(key)!;
}

function openaiClient(key: string): OpenAI {
  if (!_openai.has(key)) _openai.set(key, new OpenAI({ apiKey: key }));
  return _openai.get(key)!;
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

async function geminiEmbed(
  key: string,
  texts: string[],
  taskType: TaskType
): Promise<number[][]> {
  const model = geminiClient(key).getGenerativeModel({ model: GEMINI_EMBED });
  const out: number[][] = [];
  const BATCH = 50;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await model.batchEmbedContents({
      requests: slice.map((t) => ({
        content: { role: "user", parts: [{ text: t }] },
        taskType,
      })),
    });
    for (const e of res.embeddings) out.push(e.values);
  }
  return out;
}

async function openaiEmbed(key: string, texts: string[]): Promise<number[][]> {
  const client = openaiClient(key);
  const out: number[][] = [];
  const BATCH = 100;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await client.embeddings.create({ model: OPENAI_EMBED, input: slice });
    for (const e of res.data) out.push(e.embedding);
  }
  return out;
}

export async function embedDocuments(texts: string[], apiKey?: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { provider, key } = resolve(apiKey);
  return provider === "openai"
    ? openaiEmbed(key, texts)
    : geminiEmbed(key, texts, TaskType.RETRIEVAL_DOCUMENT);
}

export async function embedQuery(text: string, apiKey?: string): Promise<number[]> {
  const { provider, key } = resolve(apiKey);
  const [v] =
    provider === "openai"
      ? await openaiEmbed(key, [text])
      : await geminiEmbed(key, [text], TaskType.RETRIEVAL_QUERY);
  return v;
}

// ---------------------------------------------------------------------------
// Text generation
// ---------------------------------------------------------------------------

export async function generateText(
  prompt: string,
  apiKey?: string,
  opts: GenOpts = {}
): Promise<string> {
  const { provider, key } = resolve(apiKey);
  const temperature = opts.temperature ?? 0.1;
  const maxTokens = opts.maxTokens ?? 1024;

  if (provider === "openai") {
    const res = await openaiClient(key).chat.completions.create({
      model: OPENAI_CHAT,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  }

  const model = geminiClient(key).getGenerativeModel({
    model: GEMINI_CHAT,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

/** Stream generated text as an async iterable of string deltas. */
export async function* streamText(
  prompt: string,
  apiKey?: string,
  opts: GenOpts = {}
): AsyncGenerator<string> {
  const { provider, key } = resolve(apiKey);
  const temperature = opts.temperature ?? 0.1;
  const maxTokens = opts.maxTokens ?? 1024;

  if (provider === "openai") {
    const stream = await openaiClient(key).chat.completions.create({
      model: OPENAI_CHAT,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });
    for await (const part of stream) {
      const t = part.choices[0]?.delta?.content;
      if (t) yield t;
    }
    return;
  }

  const model = geminiClient(key).getGenerativeModel({
    model: GEMINI_CHAT,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });
  const result = await model.generateContentStream(prompt);
  for await (const chunk of result.stream) {
    const t = chunk.text();
    if (t) yield t;
  }
}
