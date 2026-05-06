import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const KEY = process.env.GOOGLE_API_KEY;

if (!KEY && process.env.NODE_ENV !== "test") {
  console.warn("[gemini] GOOGLE_API_KEY missing — set it in .env.local or Vercel env vars");
}

export const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite-preview";
export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

let _client: GoogleGenerativeAI | null = null;
export function gemini(): GoogleGenerativeAI {
  if (!KEY) throw new Error("GOOGLE_API_KEY is not set");
  if (!_client) _client = new GoogleGenerativeAI(KEY);
  return _client;
}

async function embed(texts: string[], taskType: TaskType): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = gemini().getGenerativeModel({ model: EMBED_MODEL });

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

export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, TaskType.RETRIEVAL_DOCUMENT);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embed([text], TaskType.RETRIEVAL_QUERY);
  return v;
}
