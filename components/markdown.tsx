"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-paper text-[15px] text-ink-soft">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  PreTag="div"
                  language={match[1]}
                  style={atomDark}
                  customStyle={{
                    background: "#1a1612",
                    margin: "0.8em 0",
                    padding: "14px 16px",
                    borderRadius: 2,
                    fontSize: "0.85em",
                    borderLeft: "3px solid #8b1a1a",
                  }}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
