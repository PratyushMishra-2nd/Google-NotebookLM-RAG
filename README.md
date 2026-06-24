# Marginalia — a NotebookLM-style RAG study

A polished RAG application inspired by Google NotebookLM. Upload PDFs or text files, ask natural-language questions, and receive grounded, citation-backed answers — powered by **Google Gemini** _or_ **OpenAI** (auto-detected from your API key), **LangChain**, and a **Qdrant** vector store (with an in-memory fallback when no Qdrant is configured). Retrieval is enhanced with query rewriting and LLM-as-judge reranking; chunks are embedded with contextual headers for sharper recall.

> Aesthetic: editorial archive / manuscript study. Cream paper, ink, and a single drop of crimson. Built with Next.js 15, TypeScript, Tailwind, and Framer Motion.

---

## Features

- **PDF + TXT + Markdown upload** with drag-and-drop, page-aware parsing, and validation
- **Contextual chunking** via LangChain `RecursiveCharacterTextSplitter` (1000 / 200), with markdown header-aware sectioning and per-chunk context headers prepended at embed time
- **Gemini / OpenAI embeddings** with batched API calls and asymmetric retrieval task types
- **Qdrant vector store** (persistent, multi-tenant by session) with an in-memory cosine fallback when no Qdrant is configured
- **Enhanced retrieval** — query rewrite (typo fix + enrichment), dual-query embedding, wide fetch (k=20), and LLM-as-judge rerank to the top 5
- **Streaming answers** with strict grounding
- **Footnoted citations** showing source document, page, and similarity score
- **Multi-document support** — each volume can be toggled on or off for retrieval
- **AI-suggested follow-up questions** generated from a sample of indexed content
- **Markdown + code highlighting** in answers
- **Refusal guarantee** — if the document doesn't answer the question, it says so
- **Vercel-ready** serverless architecture, designed for the Gemini free tier

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| LLM | Gemini `3.1-flash-lite` or OpenAI `gpt-4o-mini` (auto-detected, configurable) |
| Embeddings | Gemini `embedding-001` or OpenAI `text-embedding-3-small` |
| RAG plumbing | LangChain (`@langchain/textsplitters`) |
| Vector store | Qdrant (`@qdrant/js-client-rest`), with custom in-memory cosine fallback |
| UI | Tailwind CSS, Framer Motion, Radix primitives |
| Markdown | `react-markdown` + `react-syntax-highlighter` |

## Getting started

```bash
# 1. Install
npm install

# 2. Configure a key (Gemini or OpenAI)
cp .env.example .env.local
# then edit .env.local and paste your key from
# https://aistudio.google.com/apikey  (Gemini)
# https://platform.openai.com/api-keys (OpenAI)
# — or just paste a key in the UI; the provider is auto-detected.

# 3. Run
npm run dev
# open http://localhost:3000
```

## Environment variables

```env
# Provide at least one. The provider used per request is auto-detected:
# a UI-supplied key wins; otherwise OPENAI_API_KEY, then GOOGLE_API_KEY.
GOOGLE_API_KEY=...                              # Gemini
OPENAI_API_KEY=...                              # OpenAI
GEMINI_CHAT_MODEL=gemini-3.1-flash-lite-preview # optional override
GEMINI_EMBED_MODEL=gemini-embedding-001         # optional override
OPENAI_CHAT_MODEL=gpt-4o-mini                   # optional override
OPENAI_EMBED_MODEL=text-embedding-3-small       # optional override

# Optional: persist embeddings in Qdrant instead of the ephemeral in-memory
# store. When QDRANT_URL is unset, the app transparently uses in-memory.
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=...
```

> **Note:** embeddings from Gemini and OpenAI have different vector dimensions
> and are **not** interchangeable. The store keeps a separate collection per
> embedding dimension, so a query is only ever compared against vectors from a
> matching model. If you switch providers, re-upload (or re-query with the same
> provider) accordingly.

## Architecture

```
app/
  api/
    upload/route.ts     # POST  multipart/form-data → parse + chunk + embed
    chat/route.ts       # POST  { question, docIds? } → streamed answer
    docs/route.ts       # GET / DELETE  catalogue management
    suggest/route.ts    # GET  AI-generated follow-up prompts
  page.tsx              # Reading-room UI
  layout.tsx
  globals.css

components/
  upload-zone.tsx       # Drag-and-drop with progress
  document-sidebar.tsx  # Catalogue with per-doc scope toggle
  chat-panel.tsx        # Streaming chat + suggested prompts
  message.tsx           # Bubble with footnoted citations
  markdown.tsx          # Rendering w/ syntax highlight
  toast.tsx             # Toast provider + hook

lib/
  llm/client.ts         # Provider-routed client (Gemini/OpenAI): embed + generate + stream
  chunking/splitter.ts  # Recursive splitter + markdown sectioning + contextual headers
  vectorstore/
    types.ts            # Async VectorStore interface (storage-agnostic)
    qdrant.ts           # Qdrant-backed store + metadata persistence + GC
    memory.ts           # In-memory cosine fallback
  rag/
    parse.ts            # PDF (page-aware) + TXT/Markdown parsing
    retrieve.ts         # Query rewrite + dual-query search + LLM-as-judge rerank
    pipeline.ts         # ingestFile, answerQuestion, streamAnswer
  store.ts              # Per-session storage (cookie-keyed) + Qdrant GC scheduler
  session-cookie.ts     # HttpOnly session cookie helper

types/index.ts          # Shared TS types
utils/cn.ts             # Tailwind class merge helper
```

### Request flow

```
[Upload]   browser ──multipart──► /api/upload
                                  │
                                  ├─ parse (pdf-parse | utf-8 | markdown sections)
                                  ├─ chunkSections (1000 / 200, page + heading aware)
                                  ├─ embed (contextual header prepended, batched)
                                  └─ store.add + store.putDoc → Qdrant (or memory)

[Chat]     browser ──json──────► /api/chat
                                  │
                                  ├─ rewriteQuery (typo fix + enrichment)
                                  ├─ embed original + rewrite
                                  ├─ similaritySearch (cosine, fetch k=20, merged)
                                  ├─ rerank (LLM-as-judge → top 5)
                                  ├─ build prompt with [1][2]… excerpts
                                  └─ stream → ReadableStream
                                       (citations sent in X-Citations header)
```

## Chunking strategy

Configured in [`lib/chunking/splitter.ts`](lib/chunking/splitter.ts):

```ts
new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", ". ", " ", ""],
})
```

**Why this works well:**

1. **Recursive separators** — the splitter first tries paragraph breaks, then line breaks, then sentence boundaries, only falling back to character-level splits when needed. Chunks rarely break mid-thought.
2. **1000 characters (~200 tokens)** — large enough to keep meaningful context, small enough that the top-3 retrieval comfortably fits in the prompt with room for the answer.
3. **200-char overlap (20%)** — context that straddles chunk boundaries is preserved, so a fact mentioned at the end of chunk N also appears at the start of chunk N+1. Critical for retrieval quality on prose.
4. **Page-aware for PDFs** — each PDF page is split independently before chunking, so each chunk carries the originating page number for citation.
5. **Markdown header-aware** — `.md` files are split into sections by their headings (`splitMarkdownSections`), and each section's nearest heading is captured as metadata.

### Contextual embedding

Before embedding, each chunk is prefixed with a compact context label — `documentName — heading (p.N)` — via `contextualize()`. This is applied **at embed time only**; the stored chunk content stays raw, so citations remain clean. The effect: an isolated fragment like *"...rose 40%..."* embeds near its topic (*"Revenue, Q3"*) instead of floating free. This pairs with the asymmetric embedding task types (`RETRIEVAL_DOCUMENT` for chunks, `RETRIEVAL_QUERY` for queries).

## Retrieval

Configured in [`lib/rag/retrieve.ts`](lib/rag/retrieve.ts). Each query runs through:

1. **Query rewrite** — a small/fast chat-model pass fixes typos and enriches the query with clarifying terms. The **original query is always kept** and embedded alongside the rewrite, so a bad rewrite can only add candidates, never replace user intent.
2. **Dual-query vector search** — both forms are embedded and searched; candidates are merged and deduped by chunk id (best score wins). Wide fetch (`k=20`).
3. **LLM-as-judge rerank** — candidates are scored 0–10 for usefulness and the top 5 are kept (vector score breaks ties).

Every LLM step **degrades gracefully** to plain vector search if the model call or its parsing fails, so retrieval never hard-fails on an LLM hiccup.

## Vector store

The pipeline talks to an async `VectorStore` interface ([`lib/vectorstore/types.ts`](lib/vectorstore/types.ts)), so storage is swappable:

- **`QdrantVectorStore`** ([`lib/vectorstore/qdrant.ts`](lib/vectorstore/qdrant.ts)) — persistent, used when `QDRANT_URL` is set. One collection per embedding dimension (`nbrag_<dim>`); every point is tagged with a `sessionId` and all reads/writes filter on it, so a single cluster is safely multi-tenant. Document metadata is persisted too (`nbrag_docs`), so a cold start loses nothing. Since Qdrant has no native TTL, a throttled, upload-age GC (`gcQdrant`, 24h, runs at most every 30 min) evicts stale points.
- **`MemoryVectorStore`** ([`lib/vectorstore/memory.ts`](lib/vectorstore/memory.ts)) — the zero-infra fallback when no Qdrant is configured. One array, linear cosine scan, top-K. Fast enough for a handful of documents per session, but ephemeral (cleared on cold start / 1h idle eviction).

Sessions are keyed by an `httpOnly` cookie so multiple users don't see each other's documents.

## Grounding & refusal

The system prompt in [`lib/rag/pipeline.ts`](lib/rag/pipeline.ts) is explicit:

- Use ONLY the supplied excerpts.
- Cite inline as `[1]`, `[2]`, `[3]`.
- If excerpts are insufficient, return verbatim: *"The uploaded document does not contain enough information to answer this question."*

When the store is empty or retrieval returns no candidates, the refusal is returned directly without spending a chat-model call.

## License

MIT.
