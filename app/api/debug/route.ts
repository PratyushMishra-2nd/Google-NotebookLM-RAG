import { NextResponse } from "next/server";
import { resolveSessionId } from "@/lib/session-cookie";
import { getSession } from "@/lib/store";
import { embedQuery } from "@/lib/llm/client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { id } = await resolveSessionId();
  const session = getSession(id);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "what is this document about";

  const docs = Array.from(session.docs.values());
  const storeSize = session.store.size();

  let retrieval: object[] = [];
  let embedError: string | null = null;

  if (storeSize > 0) {
    try {
      const qvec = await embedQuery(q);
      const results = session.store.similaritySearch(qvec, 3);
      retrieval = results.map((r) => ({
        score: r.score,
        docName: r.chunk.docName,
        page: r.chunk.page,
        snippet: r.chunk.content.slice(0, 120),
      }));
    } catch (err) {
      embedError = (err as Error).message;
    }
  }

  return NextResponse.json({
    sessionId: id,
    docs,
    storeChunks: storeSize,
    query: q,
    retrieval,
    embedError,
    env: {
      GEMINI_CHAT_MODEL: process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite-preview",
      GEMINI_EMBED_MODEL: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
      OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
      GOOGLE_KEY_SET: !!process.env.GOOGLE_API_KEY,
      OPENAI_KEY_SET: !!process.env.OPENAI_API_KEY,
    },
  });
}
