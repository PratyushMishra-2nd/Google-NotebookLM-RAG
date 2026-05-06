import { GoogleGenerativeAI } from "@google/generative-ai";

const KEY = process.env.GOOGLE_API_KEY;

if (!KEY && process.env.NODE_ENV !== "test") {
  console.warn("[gemini] GOOGLE_API_KEY missing — set it in .env.local or Vercel env vars");
}

export const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash-lite";
export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

let _client: GoogleGenerativeAI | null = null;
export function gemini(): GoogleGenerativeAI {
  if (!KEY) throw new Error("GOOGLE_API_KEY is not set");
  if (!_client) _client = new GoogleGenerativeAI(KEY);
  return _client;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = gemini().getGenerativeModel({ model: EMBED_MODEL });

  const out: number[][] = [];
  const BATCH = 50;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await model.batchEmbedContents({
      requests: slice.map((t) => ({
        content: { role: "user", parts: [{ text: t }] },
      })),
    });
    for (const e of res.embeddings) out.push(e.values);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
