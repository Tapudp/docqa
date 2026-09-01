"use client";

import { useState, useEffect } from "react";

export default function TypingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  const label = elapsed < 5 ? "Thinking…" : elapsed < 20 ? `Thinking… ${elapsed}s` : `Still thinking… ${elapsed}s`;

  return (
    <>
      <style>{`
        @keyframes ti-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.25; }
          40% { transform: translateY(-8px); opacity: 1; }
        }
        @keyframes ti-sway {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(12deg); }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "4px 0" }}>
        <div
          style={{
            flexShrink: 0,
            width: "32px",
            height: "32px",
            borderRadius: "9999px",
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

        <div
          style={{
            background: "var(--airbnb-canvas)",
            border: "1px solid var(--airbnb-hairline)",
            borderRadius: "4px var(--radius-md) var(--radius-md) var(--radius-md)",
            padding: "16px 22px",
            boxShadow: "rgba(0,0,0,0.02) 0 1px 4px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <span style={{ fontSize: "26px", lineHeight: 1, animation: "ti-sway 1.8s ease-in-out infinite" }}>
            🤔
          </span>

          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--airbnb-ink)", letterSpacing: "-0.3px" }}>
            {label}
          </span>

          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  width: "10px",
                  height: "10px",
                  borderRadius: "9999px",
                  background: "var(--airbnb-ink)",
                  animation: "ti-bounce 1.2s ease-in-out infinite",
                  animationDelay: `${i * 200}ms`,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </>
  );
}
