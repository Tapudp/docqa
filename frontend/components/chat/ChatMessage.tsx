"use client";

import type { ApiMessage } from "@/lib/types";
import CitationBadge from "./CitationBadge";

interface Props {
  message: ApiMessage | { id: string; role: "user" | "assistant"; content: string; citations?: null; created_at: string };
  isStreaming?: boolean;
}

function renderBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function renderContent(content: string) {
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
    } else if (/^\d+\.\s/.test(line)) {
      flushList();
      elements.push(
        <p key={i} style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--airbnb-body)", margin: "3px 0" }}>
          {renderBoldText(line)}
        </p>
      );
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 0" }}>
        <div
          style={{
            maxWidth: "72%",
            background: "var(--airbnb-rausch)",
            borderRadius: "var(--radius-md) var(--radius-md) 4px var(--radius-md)",
            padding: "12px 16px",
          }}
        >
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

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "4px 0" }}>
      <div
        style={{
          flexShrink: 0,
          width: "32px",
          height: "32px",
          borderRadius: "var(--radius-full)",
          background: "var(--airbnb-rausch)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "2px",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10M3 8h7M3 12h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>

      <div style={{ flex: 1, maxWidth: "80%" }}>
        <div
          style={{
            background: "var(--airbnb-canvas)",
            border: "1px solid var(--airbnb-hairline)",
            borderRadius: "4px var(--radius-md) var(--radius-md) var(--radius-md)",
            padding: "14px 16px",
            boxShadow: "rgba(0,0,0,0.02) 0 1px 4px",
          }}
        >
          {isStreaming && !message.content.trim() ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "22px", animation: "docqa-sway 1.6s ease-in-out infinite" }}>🤔</span>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--airbnb-ink)" }}>
                Thinking
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--airbnb-ink)",
                      animation: "docqa-bounce 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </span>
              <style>{`
                @keyframes docqa-bounce {
                  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
                  40% { transform: translateY(-6px); opacity: 1; }
                }
                @keyframes docqa-sway {
                  0%, 100% { transform: rotate(-8deg); }
                  50% { transform: rotate(8deg); }
                }
              `}</style>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
              {renderContent(message.content)}
              {isStreaming && (
                <span
                  style={{
                    display: "inline-block",
                    width: "2px",
                    height: "16px",
                    background: "var(--airbnb-rausch)",
                    marginLeft: "2px",
                    verticalAlign: "middle",
                    animation: "blink 1s step-end infinite",
                  }}
                />
              )}
            </div>
          )}


          {citations && citations.length > 0 && (
            <div
              style={{
                marginTop: "14px",
                paddingTop: "12px",
                borderTop: "1px solid var(--airbnb-hairline-soft)",
              }}
            >
              <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "8px" }}>
                Sources
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {citations.map((c, i) => (
                  <CitationBadge key={i} citation={c} />
                ))}
              </div>
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
