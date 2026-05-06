"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState } from "react";
import { nanoid } from "nanoid";

type Tone = "info" | "success" | "error";
interface Toast {
  id: string;
  text: string;
  tone: Tone;
}

interface Ctx {
  push: (text: string, tone?: Tone) => void;
}
const ToastCtx = createContext<Ctx>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = nanoid(8);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 30, rotate: 1 }}
              animate={{ opacity: 1, x: 0, rotate: -0.4 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="pointer-events-auto max-w-sm border border-ink/20 bg-paper px-4 py-3 shadow-card relative"
              style={{
                borderLeft: `4px solid ${
                  t.tone === "error" ? "#8b1a1a" : t.tone === "success" ? "#3d5a3d" : "#1a1612"
                }`,
              }}
            >
              <div className="label-mono mb-0.5">
                {t.tone === "error" ? "Error" : t.tone === "success" ? "Filed" : "Note"}
              </div>
              <div className="text-sm text-ink leading-snug font-body">{t.text}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
