"use client";

import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/toast";
import type { UploadedDoc } from "@/types";

interface Props {
  onUploaded: (doc: UploadedDoc) => void;
  apiKey: string;
}

export function UploadZone({ onUploaded, apiKey }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const { push } = useToast();

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const f of arr) {
        setBusy(true);
        setBusyName(f.name);
        const fd = new FormData();
        fd.append("file", f);
        try {
          const res = await fetch("/api/upload", { method: "POST", body: fd, headers: { "X-API-Key": apiKey } });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Upload failed");
          onUploaded(data.doc);
          push(`${data.doc.name} filed (${data.doc.chunkCount} excerpts)`, "success");
        } catch (err) {
          push((err as Error).message, "error");
        } finally {
          setBusy(false);
          setBusyName(null);
        }
      }
    },
    [onUploaded, push]
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <motion.div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        whileHover={{ y: -1 }}
        className={cn(
          "relative cursor-pointer border border-dashed border-ink/30 px-6 py-8 transition-colors",
          "bg-paper/40",
          drag && "drop-active",
          busy && "cursor-wait"
        )}
      >
        <div className="absolute -top-3 left-4 px-2 bg-paper">
          <span className="label-mono">Acquisitions</span>
        </div>

        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-1">
            <svg width="36" height="36" viewBox="0 0 36 36" className="text-seal">
              <rect
                x="6"
                y="4"
                width="22"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="M22 4v8h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 18h12M11 22h12M11 26h8" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-display text-xl font-medium text-ink leading-tight">
              {busy ? (
                <span className="caret">Filing {busyName}…</span>
              ) : drag ? (
                <span className="text-seal">Release to file</span>
              ) : (
                "Submit a document for study"
              )}
            </p>
            <p className="text-sm text-ink-fade mt-1 font-body italic">
              Drag a <span className="font-medium text-ink-soft">PDF</span> or{" "}
              <span className="font-medium text-ink-soft">TXT</span> here, or click to browse the
              archive. Max 15&nbsp;MB.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
