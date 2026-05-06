"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import type { UploadedDoc } from "@/types";

interface Props {
  docs: UploadedDoc[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentSidebar({ docs, selected, onToggle, onRemove }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">Catalogue</span>
        <span className="font-mono text-[10px] text-ink-fade">
          {docs.length} {docs.length === 1 ? "vol." : "vols."}
        </span>
      </div>

      {docs.length === 0 ? (
        <div className="border border-ink/15 px-4 py-6 text-center dot-pattern">
          <p className="font-display italic text-ink-fade text-sm">
            The shelves stand empty.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {docs.map((d, idx) => {
              const isOn = selected.has(d.id);
              return (
                <motion.li
                  key={d.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
                  transition={{ delay: idx * 0.04 }}
                  className={cn(
                    "group relative border bg-paper/60 transition-all",
                    isOn ? "border-seal/60" : "border-ink/15"
                  )}
                >
                  {isOn && <div className="ribbon" />}
                  <button
                    onClick={() => onToggle(d.id)}
                    className="w-full text-left px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1 inline-block w-3 h-3 border border-ink/40 shrink-0",
                          isOn ? "bg-seal border-seal" : "bg-paper"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-[15px] leading-tight text-ink truncate">
                          {d.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-ink-fade">
                          <span>{fmtSize(d.size)}</span>
                          <span className="opacity-50">·</span>
                          <span>{d.chunkCount} excerpts</span>
                          {d.pages !== undefined && (
                            <>
                              <span className="opacity-50">·</span>
                              <span>{d.pages} pp.</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => onRemove(d.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-ink-fade hover:text-seal text-xs font-mono"
                    title="Discard"
                  >
                    ✕
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {docs.length > 0 && (
        <p className="text-[10px] font-mono text-ink-fade italic mt-2">
          Toggle volumes to scope retrieval.
        </p>
      )}
    </div>
  );
}
