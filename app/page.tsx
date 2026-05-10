"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UploadZone } from "@/components/upload-zone";
import { DocumentSidebar } from "@/components/document-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { ApiKeyGate, ApiKeyModal, useApiKey } from "@/components/api-key-gate";
import type { UploadedDoc } from "@/types";

export default function HomePage() {
  const { key, saveKey, clearKey, loaded } = useApiKey();
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [showKeySettings, setShowKeySettings] = useState(false);

  useEffect(() => {
    if (!key) return;
    fetch("/api/docs", { headers: { "X-API-Key": key } })
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .catch(() => {});
  }, [key]);

  const onUploaded = (doc: UploadedDoc) => {
    setDocs((d) => [...d, doc]);
    setSelected((s) => { const n = new Set(s); n.add(doc.id); return n; });
  };

  const onToggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const onRemove = async (id: string) => {
    if (key) await fetch(`/api/docs?docId=${id}`, { method: "DELETE", headers: { "X-API-Key": key } });
    setDocs((d) => d.filter((x) => x.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  if (!loaded) return null;

  return (
    <>
      {/* Gate blocks entire UI until key provided */}
      {!key && (
        <ApiKeyGate apiKey={key} onKey={saveKey} onClear={clearKey}>
          <div />
        </ApiKeyGate>
      )}

      {/* Settings modal for changing key */}
      {showKeySettings && (
        <ApiKeyModal
          currentKey={key}
          onKey={(k) => { saveKey(k); setShowKeySettings(false); }}
          onClear={() => { clearKey(); setShowKeySettings(false); }}
          showSettings
          onCloseSettings={() => setShowKeySettings(false)}
        />
      )}

      <main className="relative z-10 min-h-screen">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] min-h-screen">
          {/* Sidebar */}
          <aside className={`relative border-r border-ink/15 bg-paper/30 ${mobileSidebar ? "block" : "hidden"} lg:block`}>
            <div className="sticky top-0 px-6 py-7 max-h-screen overflow-y-auto">
              <Header />
              {key && (
                <>
                  <div className="mt-7">
                    <UploadZone onUploaded={onUploaded} apiKey={key} />
                  </div>
                  <div className="mt-7">
                    <DocumentSidebar docs={docs} selected={selected} onToggle={onToggle} onRemove={onRemove} />
                  </div>
                </>
              )}
              <Footer apiKey={key} onChangeKey={() => setShowKeySettings(true)} />
            </div>
          </aside>

          {/* Main */}
          <section className="flex flex-col min-h-screen">
            <TopBar
              onMobileToggle={() => setMobileSidebar((v) => !v)}
              mobileOpen={mobileSidebar}
              docCount={docs.length}
            />
            <div className="flex-1 min-h-0">
              <ChatPanel docs={docs} selectedDocs={selected} apiKey={key ?? ""} />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Header() {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="label-mono">Vol. I &nbsp;·&nbsp; № 001</span>
        <span className="label-mono">MMXXVI</span>
      </div>
      <div className="rule-line" />
      <div className="pt-1">
        <h1 className="font-display font-medium tracking-tight text-[34px] leading-[0.95] text-ink">
          Margin<span className="italic font-light text-seal">alia</span><span className="text-seal">.</span>
        </h1>
        <p className="font-body italic text-[13px] text-ink-fade leading-snug mt-1">
          A private reading room, indexed by Gemini.
        </p>
      </div>
      <div className="rule-line" />
    </motion.div>
  );
}

function Footer({ apiKey, onChangeKey }: { apiKey: string | null; onChangeKey: () => void }) {
  return (
    <div className="mt-10 pt-5 border-t border-ink/15 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="stamp">in-memory</span>
        <span className="stamp">no db</span>
      </div>
      {apiKey && (
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-[10px] text-ink-fade">
            key: <span className="text-ink-soft">{apiKey.slice(0, 8)}…</span>
          </span>
          <button
            onClick={onChangeKey}
            className="font-mono text-[10px] text-seal underline hover:no-underline"
          >
            change
          </button>
        </div>
      )}
      <p className="font-mono text-[10px] text-ink-fade leading-relaxed">
        Embeddings live only in this serverless instance. Refreshing the world clears the desk.
      </p>
      <p className="font-mono text-[10px] text-ink-fade italic">Gemini · LangChain · Next 15</p>
    </div>
  );
}

function TopBar({ onMobileToggle, mobileOpen, docCount }: { onMobileToggle: () => void; mobileOpen: boolean; docCount: number }) {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-ink/15 bg-paper/60 backdrop-blur-sm">
      <button onClick={onMobileToggle} className="font-mono text-[11px] tracking-widest uppercase border border-ink/30 px-3 py-1.5">
        {mobileOpen ? "Close" : `Catalogue (${docCount})`}
      </button>
      <h1 className="font-display text-xl">Margin<span className="italic text-seal">alia</span></h1>
      <div className="w-[88px]" />
    </div>
  );
}
