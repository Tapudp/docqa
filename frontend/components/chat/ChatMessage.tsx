"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/mock-data";
import CitationBadge from "./CitationBadge";

interface Props {
  message: ChatMessageType;
}

/* Parses **bold** markdown in assistant responses */
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
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: "8px 0 4px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {listBuffer.map((item, i) => (
            <li key={i} style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--airbnb-body)" }}>
              {renderBoldText(item.replace(/^-\s*/, ""))}
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
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

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div
        className="animate-fade-in"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "4px 0",
        }}
      >
        <div
          style={{
            maxWidth: "72%",
            background: "var(--airbnb-rausch)",
            borderRadius: "var(--radius-md) var(--radius-md) 4px var(--radius-md)",
            padding: "12px 16px",
          }}
        >
          <p
            style={{
              fontSize: "15px",
              lineHeight: 1.55,
              color: "white",
              margin: 0,
              fontWeight: 400,
            }}
          >
            {message.content}
          </p>
          <p
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.7)",
              marginTop: "6px",
              textAlign: "right",
            }}
          >
            {message.createdAt}
          </p>
        </div>
      </div>
    );
  }

  /* Assistant message */
  return (
    <div
      className="animate-fade-in"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "4px 0",
      }}
    >
      {/* Avatar */}
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
          <path
            d="M3 4h10M3 8h7M3 12h9"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Bubble */}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
            {renderContent(message.content)}
          </div>

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginTop: "12px",
                paddingTop: "10px",
                borderTop: "1px solid var(--airbnb-hairline-soft)",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--airbnb-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  alignSelf: "center",
                }}
              >
                Sources
              </span>
              {message.citations.map((c, i) => (
                <CitationBadge key={i} citation={c} />
              ))}
            </div>
          )}
        </div>

        <p
          style={{
            fontSize: "11px",
            color: "var(--airbnb-muted-soft)",
            marginTop: "4px",
            paddingLeft: "4px",
          }}
        >
          DocQA · {message.createdAt}
        </p>
      </div>
    </div>
  );
}
