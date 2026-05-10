"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";

const LS_KEY = "nbrag_gemini_key";

export function useApiKey() {
  const [key, setKeyState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    setKeyState(stored);
    setLoaded(true);
  }, []);

  const saveKey = (k: string) => {
    const trimmed = k.trim();
    if (trimmed) localStorage.setItem(LS_KEY, trimmed);
    else localStorage.removeItem(LS_KEY);
    setKeyState(trimmed || null);
  };

  const clearKey = () => {
    localStorage.removeItem(LS_KEY);
    setKeyState(null);
  };

  return { key, saveKey, clearKey, loaded };
}

interface Props {
  onKey: (key: string) => void;
  onClear: () => void;
  currentKey: string | null;
  showSettings?: boolean;
  onCloseSettings?: () => void;
}

export function ApiKeyModal({ onKey, onClear, currentKey, showSettings, onCloseSettings }: Props) {
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);

  const isChange = !!currentKey;

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onKey(trimmed);
    setInput("");
  };

  if (!show && !showSettings) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(26,22,18,0.55)", backdropFilter: "blur(3px)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget && isChange) {
            onCloseSettings?.();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, rotate: -0.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="relative bg-paper border border-ink/25 w-full max-w-md mx-4 p-8 shadow-[0_32px_64px_-16px_rgba(26,22,18,0.6)]"
        >
          <div className="ribbon" />

          <div className="mb-1 flex items-center justify-between">
            <span className="label-mono">Credentials</span>
            {isChange && (
              <button
                onClick={onCloseSettings}
                className="font-mono text-[11px] text-ink-fade hover:text-seal"
              >
                ✕ close
              </button>
            )}
          </div>

          <h2 className="font-display text-[28px] font-medium leading-tight text-ink mt-2">
            {isChange ? "Update" : "Enter"} your{" "}
            <span className="italic text-seal">Gemini</span> API key
          </h2>

          <p className="font-body italic text-[13px] text-ink-fade mt-2 leading-relaxed">
            Key stored only in your browser (localStorage). Never sent anywhere except Google's
            API. Get one free at{" "}
            <span className="text-ink-soft underline">aistudio.google.com/apikey</span>
          </p>

          <div className="rule-line my-4" />

          <div className="relative">
            <input
              autoFocus
              type={visible ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="AIza…"
              className="w-full border border-ink/30 bg-paper/60 px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-fade/60 outline-none focus:border-seal transition-colors pr-10"
            />
            <button
              onClick={() => setVisible((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-fade hover:text-ink"
            >
              {visible ? "hide" : "show"}
            </button>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="flex-1 bg-ink text-paper font-mono text-[11px] tracking-widest uppercase py-2.5 disabled:opacity-30 hover:bg-seal transition-colors"
            >
              {isChange ? "Update key" : "Enter archive"}
            </button>
            {isChange && (
              <button
                onClick={() => {
                  onClear();
                  onCloseSettings?.();
                }}
                className="px-4 py-2.5 border border-seal/50 font-mono text-[11px] text-seal tracking-widest uppercase hover:bg-seal/10 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {isChange && (
            <p className="mt-3 font-mono text-[10px] text-ink-fade">
              Current: <span className="text-ink-soft">{currentKey!.slice(0, 8)}…</span>
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function ApiKeyGate({
  children,
  apiKey,
  onKey,
  onClear,
}: {
  children: React.ReactNode;
  apiKey: string | null;
  onKey: (k: string) => void;
  onClear: () => void;
}) {
  if (apiKey) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(26,22,18,0.6)", backdropFilter: "blur(4px)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -0.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        className="relative bg-paper border border-ink/25 w-full max-w-md mx-4 p-8 shadow-[0_32px_64px_-16px_rgba(26,22,18,0.6)]"
      >
        <div className="ribbon" />

        <span className="label-mono">Credentials required</span>

        <h2 className="font-display text-[32px] font-medium leading-tight text-ink mt-2">
          Welcome to{" "}
          <span className="italic">
            Margin<span className="text-seal">alia</span>
          </span>
        </h2>

        <p className="font-body text-[15px] text-ink-soft mt-3 leading-relaxed">
          A private reading room for your documents. Answers are grounded strictly in what
          you upload — never from the model's general knowledge.
        </p>

        <div className="rule-line my-5" />

        <p className="font-body italic text-[13px] text-ink-fade mb-4 leading-relaxed">
          Paste your free Gemini API key to begin. Stored only in your browser — never on any
          server. Get one at{" "}
          <span className="text-ink-soft underline">aistudio.google.com/apikey</span>
        </p>

        <KeyInput onSubmit={onKey} />

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="stamp">in-memory</span>
          <span className="stamp">no db</span>
          <span className="stamp">your key</span>
        </div>
      </motion.div>
    </div>
  );
}

function KeyInput({ onSubmit }: { onSubmit: (k: string) => void }) {
  const [val, setVal] = useState("");
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="relative">
        <input
          autoFocus
          type={visible ? "text" : "password"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && val.trim() && onSubmit(val.trim())}
          placeholder="AIza…"
          className="w-full border border-ink/30 bg-paper/60 px-3 py-3 font-mono text-sm text-ink placeholder:text-ink-fade/60 outline-none focus:border-seal transition-colors pr-14"
        />
        <button
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-fade hover:text-ink"
        >
          {visible ? "hide" : "show"}
        </button>
      </div>
      <button
        onClick={() => val.trim() && onSubmit(val.trim())}
        disabled={!val.trim()}
        className="mt-2 w-full bg-ink text-paper font-mono text-[11px] tracking-widest uppercase py-3 disabled:opacity-30 hover:bg-seal transition-colors"
      >
        Enter archive →
      </button>
    </div>
  );
}
