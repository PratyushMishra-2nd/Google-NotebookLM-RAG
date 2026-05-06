import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "Marginalia — A NotebookLM-style RAG study",
  description:
    "Upload documents and chat with them. Grounded answers, cited excerpts, in-memory retrieval. Powered by Google Gemini.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23f4ecd8'/%3E%3Ctext x='50%25' y='62%25' font-size='22' text-anchor='middle' font-family='Georgia,serif' font-weight='900' font-style='italic' fill='%238b1a1a'%3EM%3C/text%3E%3C/svg%3E",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
