import { NextResponse } from "next/server";
import { ingestFile } from "@/lib/rag/pipeline";
import { resolveSessionId } from "@/lib/session-cookie";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { id: sessionId } = await resolveSessionId();
    const apiKey = req.headers.get("X-API-Key") ?? undefined;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await ingestFile(sessionId, {
      name: file.name,
      size: file.size,
      mime: file.type,
      buffer,
    }, apiKey);

    return NextResponse.json({ doc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
