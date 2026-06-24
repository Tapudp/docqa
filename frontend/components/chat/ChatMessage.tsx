"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ApiMessage } from "@/lib/types";
import CitationBadge from "./CitationBadge";

// ── Mermaid diagram block ─────────────────────────────────────

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      mermaid
        .render(idRef.current, code)
        .then(({ svg: rendered }) => { if (!cancelled) setSvg(rendered); })
        .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); });
    });
    return () => { cancelled = true; };
  }, [code]);

  const downloadSVG = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    triggerDownload(blob, "diagram.svg");
  };

  const downloadSource = () => {
    const blob = new Blob([code], { type: "text/plain" });
    triggerDownload(blob, "diagram.mmd");
  };

  return (
    <div style={{ border: "1px solid var(--airbnb-hairline)", borderRadius: "8px", overflow: "hidden", margin: "12px 0" }}>
      <div style={{
        background: "#f8f9fa",
        borderBottom: "1px solid var(--airbnb-hairline)",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
          Mermaid Diagram
        </span>
        {svg && (
          <div style={{ display: "flex", gap: "6px" }}>
            <DownloadChip label="SVG" onClick={downloadSVG} primary />
            <DownloadChip label=".mmd" onClick={downloadSource} />
          </div>
        )}
      </div>
      <div style={{ padding: "20px", background: "white", display: "flex", justifyContent: "center", minHeight: "80px", alignItems: "center" }}>
        {error ? (
          <span style={{ color: "#dc2626", fontSize: "13px" }}>Failed to render: {error}</span>
        ) : svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} style={{ maxWidth: "100%" }} />
        ) : (
          <span style={{ color: "var(--airbnb-muted)", fontSize: "13px" }}>Rendering diagram…</span>
        )}
      </div>
    </div>
  );
}

// ── Generic code block ────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", overflow: "hidden", margin: "12px 0" }}>
      <div style={{
        background: "#1a1a2e",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
          {language || "code"}
        </span>
        <button onClick={copy} style={{
          fontSize: "11px",
          color: copied ? "#4ade80" : "rgba(255,255,255,0.4)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 4px",
          transition: "color 0.2s",
        }}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre style={{ background: "#0f0f1a", margin: 0, padding: "14px 16px", overflowX: "auto" }}>
        <code style={{ fontSize: "13px", color: "#c9d1d9", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.65, whiteSpace: "pre" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DownloadChip({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: "11px",
        fontWeight: 600,
        color: primary ? "var(--airbnb-rausch)" : "var(--airbnb-muted)",
        background: "white",
        border: `1px solid ${primary ? "var(--airbnb-rausch)" : "var(--airbnb-hairline)"}`,
        borderRadius: "4px",
        padding: "2px 8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "3px",
      }}
    >
      ↓ {label}
    </button>
  );
}

// ── Markdown renderer (used after streaming is done) ──────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  // Block code → mermaid diagram or syntax-highlighted code block
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (!child || typeof child !== "object") return <pre>{children}</pre>;
    const el = child as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
    const className = el.props?.className ?? "";
    const lang = className.replace("language-", "");
    const code = String(el.props?.children ?? "").replace(/\n$/, "");
    if (lang === "mermaid") return <MermaidBlock code={code} />;
    return <CodeBlock language={lang} code={code} />;
  },
  // Inline code
  code({ children, className }) {
    if (className) return <code className={className}>{children}</code>;
    return (
      <code style={{
        background: "rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: "4px",
        padding: "1px 5px",
        fontFamily: "monospace",
        fontSize: "13px",
        color: "var(--airbnb-ink)",
      }}>
        {children}
      </code>
    );
  },
  // Headings
  h1: ({ children }) => <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "16px 0 8px", color: "var(--airbnb-ink)" }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "14px 0 6px", color: "var(--airbnb-ink)" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "12px 0 4px", color: "var(--airbnb-ink)" }}>{children}</h3>,
  // Paragraphs & text
  p: ({ children }) => <p style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--airbnb-body)", margin: "4px 0" }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--airbnb-ink)" }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
  // Lists
  ul: ({ children }) => <ul style={{ margin: "6px 0 6px 20px", display: "flex", flexDirection: "column", gap: "3px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "6px 0 6px 20px", display: "flex", flexDirection: "column", gap: "3px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--airbnb-body)" }}>{children}</li>,
  // Blockquote
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: "3px solid var(--airbnb-rausch)",
      paddingLeft: "12px",
      margin: "8px 0",
      color: "var(--airbnb-muted)",
      fontStyle: "italic",
    }}>
      {children}
    </blockquote>
  ),
  // Tables
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "12px 0" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "14px" }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: "#f8f9fa" }}>{children}</thead>,
  th: ({ children }) => (
    <th style={{ border: "1px solid var(--airbnb-hairline)", padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--airbnb-ink)" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: "1px solid var(--airbnb-hairline)", padding: "8px 12px", color: "var(--airbnb-body)" }}>
      {children}
    </td>
  ),
  // Horizontal rule
  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--airbnb-hairline)", margin: "12px 0" }} />,
  // Links
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--airbnb-rausch)", textDecoration: "underline" }}>
      {children}
    </a>
  ),
};

// ── Simple streaming renderer (no markdown parsing during stream) ──

function renderBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function renderStreamContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`list-${elements.length}`} style={{ margin: "8px 0 4px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--airbnb-body)" }}>
            {renderBoldText(item.replace(/^[-*]\s*/, ""))}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((line, i) => {
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line);
    } else {
      flushList();
      if (line.trim() === "") {
        elements.push(<div key={i} style={{ height: "8px" }} />);
      } else {
        elements.push(
          <p key={i} style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--airbnb-body)", margin: 0 }}>
            {renderBoldText(line)}
          </p>
        );
      }
    }
  });
  flushList();
  return elements;
}

// ── Detect if content has rich structure worth downloading ────

function hasRichContent(content: string) {
  return /^#{1,3}\s|```|^\|.+\|/m.test(content);
}

// ── Main component ────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  message: ApiMessage | { id: string; role: "user" | "assistant"; content: string; citations?: null; created_at: string };
  isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === "user";

  const downloadMarkdown = () => {
    const blob = new Blob([message.content], { type: "text/markdown" });
    triggerDownload(blob, "response.md");
  };

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 0" }}>
        <div style={{
          maxWidth: "72%",
          background: "var(--airbnb-rausch)",
          borderRadius: "var(--radius-md) var(--radius-md) 4px var(--radius-md)",
          padding: "12px 16px",
        }}>
          <p style={{ fontSize: "15px", lineHeight: 1.55, color: "white", margin: 0 }}>
            {message.content}
          </p>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: "6px", textAlign: "right" }}>
            {formatTime(message.created_at)}
          </p>
        </div>
      </div>
    );
  }

  const citations = (message as ApiMessage).citations;
  const rich = hasRichContent(message.content);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "4px 0" }}>
      {/* Avatar */}
      <div style={{
        flexShrink: 0,
        width: "32px",
        height: "32px",
        borderRadius: "var(--radius-full)",
        background: "var(--airbnb-rausch)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: "2px",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10M3 8h7M3 12h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>

      <div style={{ flex: 1, maxWidth: "80%" }}>
        <div style={{
          background: "var(--airbnb-canvas)",
          border: "1px solid var(--airbnb-hairline)",
          borderRadius: "4px var(--radius-md) var(--radius-md) var(--radius-md)",
          padding: "14px 16px",
          boxShadow: "rgba(0,0,0,0.02) 0 1px 4px",
        }}>
          {/* Thinking indicator */}
          {isStreaming && !message.content.trim() ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "22px", animation: "docqa-sway 1.6s ease-in-out infinite" }}>🤔</span>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--airbnb-ink)" }}>Thinking</span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "var(--airbnb-ink)",
                    animation: "docqa-bounce 1.2s ease-in-out infinite",
                    animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
              </span>
              <style>{`
                @keyframes docqa-bounce { 0%,80%,100%{transform:translateY(0);opacity:.3} 40%{transform:translateY(-6px);opacity:1} }
                @keyframes docqa-sway { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
              `}</style>
            </div>
          ) : isStreaming ? (
            // Simple renderer during stream to avoid mermaid flicker
            <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
              {renderStreamContent(message.content)}
              <span style={{
                display: "inline-block",
                width: "2px",
                height: "16px",
                background: "var(--airbnb-rausch)",
                marginLeft: "2px",
                verticalAlign: "middle",
                animation: "blink 1s step-end infinite",
              }} />
            </div>
          ) : (
            // Full markdown render when done
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Sources */}
          {citations && citations.length > 0 && (
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--airbnb-hairline-soft)" }}>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "8px" }}>
                Sources
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {citations.map((c, i) => <CitationBadge key={i} citation={c} />)}
              </div>
            </div>
          )}

          {/* Download bar — only when content has rich structure or is substantial */}
          {!isStreaming && (rich || message.content.length > 400) && (
            <div style={{
              marginTop: "12px",
              paddingTop: "10px",
              borderTop: "1px solid var(--airbnb-hairline-soft)",
              display: "flex",
              justifyContent: "flex-end",
            }}>
              <button
                onClick={downloadMarkdown}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--airbnb-muted)",
                  background: "none",
                  border: "1px solid var(--airbnb-hairline)",
                  borderRadius: "4px",
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download .md
              </button>
            </div>
          )}
        </div>

        {!isStreaming && (
          <p style={{ fontSize: "11px", color: "var(--airbnb-muted-soft)", marginTop: "4px", paddingLeft: "4px" }}>
            DocQA · {formatTime(message.created_at)}
          </p>
        )}
      </div>
    </div>
  );
}
