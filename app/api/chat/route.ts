import { NextResponse } from "next/server";
import { streamAnswer } from "@/lib/rag/pipeline";
import { resolveSessionId } from "@/lib/session-cookie";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { id: sessionId } = await resolveSessionId();
    const body = await req.json();
    const question = (body?.question ?? "").toString().trim();
    const docIds: string[] | undefined = Array.isArray(body?.docIds) ? body.docIds : undefined;

    if (!question) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }

    const { stream, citations } = await streamAnswer(sessionId, question, { docIds, topK: 3 });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Citations": Buffer.from(JSON.stringify(citations)).toString("base64"),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chat failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
