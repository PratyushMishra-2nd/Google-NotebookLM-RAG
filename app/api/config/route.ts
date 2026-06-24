import { NextResponse } from "next/server";
import { qdrantClient } from "@/lib/vectorstore/qdrant";

export const runtime = "nodejs";

// Surfaces server-side config the UI needs to display accurately (e.g. which
// vector store backend is actually active). No secrets.
export async function GET() {
  return NextResponse.json({ store: qdrantClient() ? "qdrant" : "in-memory" });
}
