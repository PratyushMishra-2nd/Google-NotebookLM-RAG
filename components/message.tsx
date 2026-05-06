"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { WaxSeal3D } from "@/components/three/wax-seal-3d";
import type { ChatMessage } from "@/types";
import { cn } from "@/utils/cn";

export function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3 items-start"
      >
        <div className="shrink-0 w-8 h-8 border border-ink/40 grid place-items-center font-mono text-[10px] tracking-wider bg-paper">
          YOU
        </div>
        <div className="flex-1 pt-1">
          <p className="font-display italic text-[17px] text-ink leading-snug">
            {message.content}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative"
    >
      <div className="flex gap-3 items-start">
        <div className="shrink-0 mt-0.5">
          <WaxSeal3D size={52} />
        </div>
        <div className="flex-1 pt-2 min-w-0">
          <div className="label-mono mb-1.5">Marginalia · response</div>
          <div className={cn("relative", streaming && "caret")}>
            {message.content ? (
              <Markdown>{message.content}</Markdown>
            ) : (
              <div className="space-y-2 py-1">
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-3 w-5/6" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            )}
          </div>

          {message.citations && message.citations.length > 0 && (
            <Citations citations={message.citations} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Citations({ citations }: { citations: NonNullable<ChatMessage["citations"]> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mt-4 pt-3 border-t border-ink/15">
      <div className="label-mono mb-2">Footnotes</div>
      <ol className="space-y-1.5">
        {citations.map((c, i) => (
          <li key={i} className="font-mono text-[12px]">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="text-left hover:text-seal transition-colors group"
            >
              <span className="text-seal font-semibold mr-1.5">[{i + 1}]</span>
              <span className="text-ink-soft underline-wave">
                {c.docName}
                {c.page ? `, p. ${c.page}` : ""}
              </span>
              <span className="ml-2 text-ink-fade">
                · sim {(c.score * 100).toFixed(0)}%
              </span>
            </button>
            {open === i && (
              <motion.blockquote
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-1.5 ml-5 pl-3 border-l-2 border-seal/40 text-ink-fade italic font-body text-[13px] leading-relaxed"
              >
                "{c.snippet.replace(/\s+/g, " ").trim()}…"
              </motion.blockquote>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
