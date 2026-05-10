import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

export const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite-preview";
export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

// Per-key client cache — avoids reinstantiating on every call.
const _clients = new Map<string, GoogleGenerativeAI>();

export function gemini(apiKey?: string): GoogleGenerativeAI {
  const key = apiKey ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("No API key — set GOOGLE_API_KEY env var or pass your key in the UI.");
  if (!_clients.has(key)) _clients.set(key, new GoogleGenerativeAI(key));
  return _clients.get(key)!;
}

async function embed(texts: string[], taskType: TaskType, apiKey?: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = gemini(apiKey).getGenerativeModel({ model: EMBED_MODEL });

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

export function embedDocuments(texts: string[], apiKey?: string): Promise<number[][]> {
  return embed(texts, TaskType.RETRIEVAL_DOCUMENT, apiKey);
}

export async function embedQuery(text: string, apiKey?: string): Promise<number[]> {
  const [v] = await embed([text], TaskType.RETRIEVAL_QUERY, apiKey);
  return v;
}
