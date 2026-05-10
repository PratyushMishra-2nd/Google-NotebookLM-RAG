"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nanoid } from "nanoid";
import { MessageBubble } from "@/components/message";
import { useToast } from "@/components/toast";
import type { ChatMessage, Citation, UploadedDoc } from "@/types";

interface Props {
  docs: UploadedDoc[];
  selectedDocs: Set<string>;
  apiKey: string;
}

const SAMPLE_PROMPTS = [
  "Summarize the key arguments.",
  "What evidence is presented?",
  "List any cited authors or sources.",
  "What conclusions does the author draw?",
];

export function ChatPanel({ docs, selectedDocs, apiKey }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { push } = useToast();

  const ready = docs.length > 0;

  useEffect(() => {
    if (!ready) {
      setSuggestions([]);
      return;
    }
    if (messages.length === 0) {
      fetch("/api/suggest", { headers: apiKey ? { "X-API-Key": apiKey } : {} })
        .then((r) => r.json())
        .then((d) => setSuggestions(Array.isArray(d.questions) ? d.questions : []))
        .catch(() => {});
    }
  }, [ready, docs.length, messages.length]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = async (questionRaw?: string) => {
    const q = (questionRaw ?? input).trim();
    if (!q || busy) return;
    if (!ready) {
      push("File a document before asking questions.", "info");
      return;
    }

    const userMsg: ChatMessage = {
      id: nanoid(8),
      role: "user",
      content: q,
      createdAt: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: nanoid(8),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setBusy(true);

    try {
      const docIds = selectedDocs.size > 0 ? Array.from(selectedDocs) : undefined;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
        body: JSON.stringify({ question: q, docIds }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Chat failed");
      }

      const cb64 = res.headers.get("X-Citations");
      let citations: Citation[] = [];
      if (cb64) {
        try {
          // Decode base64 → bytes → utf-8 (handles non-ASCII in citation snippets)
          const bin = atob(cb64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          citations = JSON.parse(new TextDecoder().decode(bytes));
        } catch {}
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { ...next[next.length - 1], content: acc };
          return next;
        });
      }

      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { ...next[next.length - 1], citations };
        return next;
      });
    } catch (err) {
      push((err as Error).message, "error");
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: "_Failed to retrieve an answer._",
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 md:px-10 lg:px-16 py-8">
        <div className="max-w-2xl mx-auto">
          {messages.length === 0 ? (
            <EmptyState ready={ready} suggestions={suggestions} onPick={send} docs={docs} />
          ) : (
            <div className="space-y-10">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    streaming={busy && i === messages.length - 1 && m.role === "assistant"}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-ink/15 bg-paper-deep/40 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 md:px-10 lg:px-0 py-4">
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            disabled={busy}
            placeholder={
              ready
                ? "Pose a question to the archive…"
                : "Upload a document to begin."
            }
          />
          <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-ink-fade">
            <span>
              ⏎ to send · ⇧⏎ for newline · top-3 retrieval ·{" "}
              {selectedDocs.size > 0
                ? `scoped to ${selectedDocs.size} vol.`
                : "all volumes"}
            </span>
            <span className="italic">— marginalia v1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex items-end gap-2 border border-ink/30 bg-paper px-3 py-2 focus-within:border-seal transition-colors">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          e.currentTarget.style.height = "auto";
          e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 160) + "px";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        className="flex-1 resize-none bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-ink-fade/70 placeholder:italic leading-relaxed py-1"
      />
      <button
        onClick={onSend}
        disabled={disabled || value.trim().length === 0}
        className="shrink-0 self-end h-9 px-4 bg-ink text-paper font-mono text-[11px] tracking-widest uppercase disabled:opacity-30 hover:bg-seal transition-colors"
      >
        {disabled ? "…" : "Inquire"}
      </button>
    </div>
  );
}

function EmptyState({
  ready,
  suggestions,
  onPick,
  docs,
}: {
  ready: boolean;
  suggestions: string[];
  onPick: (q: string) => void;
  docs: UploadedDoc[];
}) {
  const prompts = suggestions.length ? suggestions : SAMPLE_PROMPTS;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-10 md:py-14"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="stamp">Ready · for · query</span>
      </div>
      <h2 className="font-display text-[44px] md:text-[56px] leading-[0.95] font-medium tracking-tight text-ink">
        A reading room for
        <br />
        your <em className="italic font-display underline-wave">documents</em>.
      </h2>
      <p className="mt-5 font-body text-[17px] text-ink-soft leading-relaxed max-w-xl drop-cap">
        Upload a PDF or text file to the catalogue, then pose any question. Marginalia retrieves
        the three most relevant excerpts and composes an answer grounded strictly in what the
        document actually says — with footnotes for every claim.
      </p>

      {ready && (
        <div className="mt-10">
          <div className="label-mono mb-3">Try asking</div>
          <ul className="space-y-2">
            {prompts.slice(0, 4).map((p, i) => (
              <motion.li
                key={p + i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                <button
                  onClick={() => onPick(p)}
                  className="text-left w-full group flex items-baseline gap-3 py-1.5 hover:text-seal transition-colors"
                >
                  <span className="font-mono text-[11px] text-ink-fade group-hover:text-seal">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display italic text-[18px] text-ink-soft group-hover:text-seal">
                    {p}
                  </span>
                  <span className="ml-auto text-ink-fade group-hover:text-seal text-sm">↗</span>
                </button>
                <div className="rule-line" />
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      {!ready && (
        <div className="mt-10 border border-ink/15 px-5 py-4 dot-pattern">
          <p className="font-display italic text-ink-fade">
            No documents on the desk yet — file one from the panel at left.
          </p>
        </div>
      )}

      {ready && (
        <div className="mt-10 text-[11px] font-mono text-ink-fade italic">
          {docs.length} document{docs.length === 1 ? "" : "s"} indexed ·{" "}
          {docs.reduce((n, d) => n + d.chunkCount, 0)} excerpts available for retrieval.
        </div>
      )}
    </motion.div>
  );
}
