import { MemoryVectorStore } from "@/lib/vectorstore/memory";
import type { UploadedDoc } from "@/types";

interface Session {
  store: MemoryVectorStore;
  docs: Map<string, UploadedDoc>;
  createdAt: number;
  touchedAt: number;
}

// Anchor to globalThis so the Map survives Next.js HMR module re-evaluation
// and cross-route isolation in both dev and serverless edge environments.
const g = globalThis as typeof globalThis & { __nbrag?: Map<string, Session> };
if (!g.__nbrag) g.__nbrag = new Map();
const SESSIONS = g.__nbrag;

const TTL_MS = 1000 * 60 * 60; // 1h idle eviction

function gc() {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (now - s.touchedAt > TTL_MS) SESSIONS.delete(id);
  }
}

export function getSession(id: string): Session {
  gc();
  let s = SESSIONS.get(id);
  if (!s) {
    s = {
      store: new MemoryVectorStore(),
      docs: new Map(),
      createdAt: Date.now(),
      touchedAt: Date.now(),
    };
    SESSIONS.set(id, s);
  } else {
    s.touchedAt = Date.now();
  }
  return s;
}

export function dropSession(id: string): void {
  SESSIONS.delete(id);
}
