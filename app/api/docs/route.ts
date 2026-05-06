import { NextResponse } from "next/server";
import { listDocs, removeDoc } from "@/lib/rag/pipeline";
import { resolveSessionId } from "@/lib/session-cookie";

export const runtime = "nodejs";

export async function GET() {
  const { id } = await resolveSessionId();
  return NextResponse.json({ docs: listDocs(id) });
}

export async function DELETE(req: Request) {
  const { id } = await resolveSessionId();
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "Missing docId" }, { status: 400 });
  const ok = removeDoc(id, docId);
  return NextResponse.json({ ok });
}
