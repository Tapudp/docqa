"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { mockWorkspaces } from "@/lib/mock-data";

export default function Sidebar() {
  const { workspace, selectedConvId, setSelectedConv } = useStore();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  return (
    <aside
      style={{
        width: "260px",
        minWidth: "260px",
        height: "100%",
        background: "var(--airbnb-surface-soft)",
        borderRight: "1px solid var(--airbnb-hairline)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Workspace switcher */}
      <div style={{ padding: "14px 12px 10px" }}>
        <button
          onClick={() => setShowWorkspaceMenu((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 11px",
            background: "var(--airbnb-canvas)",
            border: "1px solid var(--airbnb-hairline)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            transition: "border-color 0.12s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "5px",
                background: "var(--airbnb-rausch)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 2.5h9M1 5.5h6M1 8.5h7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--airbnb-ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {workspace.name}
            </span>
          </div>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{
              flexShrink: 0,
              transform: showWorkspaceMenu ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          >
            <path d="M2 3.5l3 3 3-3" stroke="var(--airbnb-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Workspace dropdown */}
        {showWorkspaceMenu && (
          <div
            className="animate-slide-up"
            style={{
              marginTop: "4px",
              background: "var(--airbnb-canvas)",
              border: "1px solid var(--airbnb-hairline)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {mockWorkspaces.map((ws, i) => {
              const isActive = ws.id === workspace.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setShowWorkspaceMenu(false)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: isActive ? "#fff5f7" : "transparent",
                    border: "none",
                    borderBottom: i < mockWorkspaces.length - 1 ? "1px solid var(--airbnb-hairline-soft)" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                  }}
                >
                  {isActive ? (
                    <div
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        background: "var(--airbnb-rausch)",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div style={{ width: "5px", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "var(--airbnb-rausch)" : "var(--airbnb-ink)",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ws.name}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--airbnb-muted)",
                        display: "block",
                      }}
                    >
                      {ws.description}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* New workspace row */}
            <button
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "transparent",
                border: "none",
                borderTop: "1px solid var(--airbnb-hairline-soft)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "9px",
              }}
            >
              <div style={{ width: "5px", flexShrink: 0 }} />
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="var(--airbnb-muted)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>New workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* New conversation button */}
      <div style={{ padding: "0 12px 12px" }}>
        <button
          style={{
            width: "100%",
            height: "36px",
            background: "var(--airbnb-rausch)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "13px",
            fontWeight: 500,
            color: "white",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "background-color 0.12s ease, transform 0.1s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Section label */}
      <div style={{ padding: "0 16px 6px" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--airbnb-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.6px",
          }}
        >
          Conversations
        </span>
      </div>

      {/* Conversations list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0 8px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {workspace.conversations.map((conv) => {
            const isActive = conv.id === selectedConvId;
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                style={{
                  width: "100%",
                  padding: "9px 10px 9px 13px",
                  borderRadius: "var(--radius-sm)",
                  background: isActive ? "var(--airbnb-canvas)" : "transparent",
                  border: isActive ? "1px solid var(--airbnb-hairline)" : "1px solid transparent",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background-color 0.1s ease, border-color 0.1s ease",
                  position: "relative",
                }}
              >
                {/* Active indicator */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "8px",
                      bottom: "8px",
                      width: "3px",
                      borderRadius: "0 2px 2px 0",
                      background: "var(--airbnb-rausch)",
                    }}
                  />
                )}

                <p
                  style={{
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--airbnb-ink)" : "var(--airbnb-body)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    margin: 0,
                    lineHeight: 1.35,
                  }}
                >
                  {conv.title}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                  <span style={{ fontSize: "11px", color: "var(--airbnb-muted)" }}>
                    {conv.updatedAt}
                  </span>
                  <span style={{ color: "var(--airbnb-hairline)", fontSize: "10px" }}>·</span>
                  <span style={{ fontSize: "11px", color: "var(--airbnb-muted)" }}>
                    {conv.messageCount} msgs
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid var(--airbnb-hairline)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "#22c55e",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "11px", color: "var(--airbnb-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {workspace.parser} · {workspace.llm} · {workspace.retrievalMode}
          </span>
        </div>
      </div>
    </aside>
  );
}
