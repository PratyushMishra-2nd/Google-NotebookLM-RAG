# Marginalia — a NotebookLM-style RAG study

A polished, single-tenant RAG application inspired by Google NotebookLM. Upload PDFs or text files, ask natural-language questions, and receive grounded, citation-backed answers — all powered by **Google Gemini**, **LangChain**, and an **in-memory vector store**. No external database, no OpenAI, no fuss.

> Aesthetic: editorial archive / manuscript study. Cream paper, ink, and a single drop of crimson. Built with Next.js 15, TypeScript, Tailwind, and Framer Motion.

---

## Features

- **PDF + TXT upload** with drag-and-drop, page-aware parsing, and validation
- **Smart chunking** via LangChain `RecursiveCharacterTextSplitter` (1000 / 200)
- **Gemini embeddings** (`gemini-embedding-001`) with batched API calls
- **In-memory vector store** with manual cosine similarity — zero infra
- **Top-3 retrieval** scoped optionally to selected documents
- **Streaming answers** from `gemini-2.5-flash-lite` with strict grounding
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
| LLM | Gemini `2.5-flash-lite` (configurable) |
| Embeddings | Gemini `embedding-001` |
| RAG plumbing | LangChain (`@langchain/textsplitters`) |
| Vector store | Custom in-memory cosine index |
| UI | Tailwind CSS, Framer Motion, Radix primitives |
| Markdown | `react-markdown` + `react-syntax-highlighter` |

## Getting started

```bash
# 1. Install
npm install

# 2. Configure the Gemini key
cp .env.example .env.local
# then edit .env.local and paste your key from
# https://aistudio.google.com/apikey

# 3. Run
npm run dev
# open http://localhost:3000
```

## Environment variables

```env
GOOGLE_API_KEY=...            # required
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite     # optional override
GEMINI_EMBED_MODEL=gemini-embedding-001     # optional override
```

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
  gemini/client.ts      # Singleton Gemini client + batched embedTexts
  chunking/splitter.ts  # RecursiveCharacterTextSplitter wrapper
  vectorstore/memory.ts # MemoryVectorStore + cosine similarity
  rag/
    parse.ts            # PDF (page-aware) + TXT parsing
    pipeline.ts         # ingestFile, answerQuestion, streamAnswer
  store.ts              # Per-session ephemeral storage (cookie-keyed)
  session-cookie.ts     # HttpOnly session cookie helper

types/index.ts          # Shared TS types
utils/cn.ts             # Tailwind class merge helper
```

### Request flow

```
[Upload]   browser ──multipart──► /api/upload
                                  │
                                  ├─ parse (pdf-parse | utf-8)
                                  ├─ chunkSections (1000 / 200, page-aware)
                                  ├─ embedTexts (Gemini, batched)
                                  └─ MemoryVectorStore.add → session

[Chat]     browser ──json──────► /api/chat
                                  │
                                  ├─ embedQuery
                                  ├─ similaritySearch (cosine, topK=3)
                                  ├─ build prompt with [1][2][3] excerpts
                                  └─ Gemini stream → ReadableStream
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

## Vector store

`MemoryVectorStore` ([`lib/vectorstore/memory.ts`](lib/vectorstore/memory.ts)) is a deliberately tiny class:

- One array of `{ embedding, content, docId, page, … }`
- `similaritySearch(qvec, k, docIds?)` does a linear scan, computes cosine similarity per chunk, sorts, and returns top-K
- No file persistence, no external service

For typical NotebookLM-style use (a handful of documents, a few hundred chunks per session) a linear scan is fast enough that adding ANN indexing would be premature.

### A note on serverless durability

Vercel serverless functions are stateless across cold starts. The store lives in module-scope memory, so:

- Within one warm instance, uploaded documents persist across requests.
- A cold start (deploy, idle eviction) clears everything — the user simply re-uploads.
- This is a deliberate tradeoff to honour the "no external DB" constraint. For multi-instance durability you would swap `MemoryVectorStore` for any persistent backend; the interface is intentionally minimal.

Sessions are keyed by an `httpOnly` cookie so multiple users on the same instance don't see each other's documents.

## Grounding & refusal

The system prompt in [`lib/rag/pipeline.ts`](lib/rag/pipeline.ts) is explicit:

- Use ONLY the supplied excerpts.
- Cite inline as `[1]`, `[2]`, `[3]`.
- If excerpts are insufficient, return verbatim: *"The uploaded document does not contain enough information to answer this question."*

A similarity floor (top-1 score < 0.35) short-circuits retrieval and returns the refusal directly, before spending a chat-model call.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import into Vercel — defaults work (Next.js detected).
3. In **Settings → Environment Variables**, add `GOOGLE_API_KEY`.
4. Deploy.

The project ships with `runtime = "nodejs"` and `maxDuration = 60` on the heavy routes (`upload`, `chat`) so Gemini's slowest paths don't time out on the Hobby plan.

## Free-tier hygiene

- Embeddings batched at 50 per request
- Top-K retrieval kept at 3
- Chat call uses `temperature: 0.1` and `maxOutputTokens: 1024`
- Suggestion endpoint samples only the first chunk of the first 3 docs
- Session storage GCs idle sessions after one hour

## License

MIT.
