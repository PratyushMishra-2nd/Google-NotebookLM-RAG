import { MemoryVectorStore } from "@/lib/vectorstore/memory";
import { QdrantVectorStore, qdrantClient, gcQdrant } from "@/lib/vectorstore/qdrant";
import type { VectorStore } from "@/lib/vectorstore/types";

interface Session {
  store: VectorStore;
  createdAt: number;
  touchedAt: number;
}

/** Qdrant-backed store when QDRANT_URL is set, else ephemeral in-memory. */
function createStore(sessionId: string): VectorStore {
  const client = qdrantClient();
  return client ? new QdrantVectorStore(client, sessionId) : new MemoryVectorStore();
}

// Anchor to globalThis so the Map survives Next.js HMR module re-evaluation
// and cross-route isolation in both dev and serverless edge environments.
const g = globalThis as typeof globalThis & { __nbrag?: Map<string, Session> };
if (!g.__nbrag) g.__nbrag = new Map();
const SESSIONS = g.__nbrag;

const TTL_MS = 1000 * 60 * 60; // 1h idle eviction (in-memory sessions)

// Persisted Qdrant points have no native TTL. Evict by ingest age, throttled so
// the scan runs at most once per interval regardless of request volume.
const QDRANT_TTL_MS = 1000 * 60 * 60 * 24; // 24h, matches the session cookie
const QDRANT_GC_INTERVAL_MS = 1000 * 60 * 30; // run at most every 30 min
let _lastQdrantGc = 0;

function gc() {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (now - s.touchedAt > TTL_MS) SESSIONS.delete(id);
  }
  if (now - _lastQdrantGc > QDRANT_GC_INTERVAL_MS) {
    _lastQdrantGc = now;
    void gcQdrant(QDRANT_TTL_MS); // fire-and-forget, best-effort
  }
}

export function getSession(id: string): Session {
  gc();
  let s = SESSIONS.get(id);
  if (!s) {
    s = {
      store: createStore(id),
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
