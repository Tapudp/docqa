"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function Sidebar() {
  const {
    apiWorkspaces, activeWorkspaceId,
    conversations, addConversation,
    activeConversationId, setActiveConversationId,
    setMessages, clearStreaming, setIsStreaming,
    uploadOpen, setUploadOpen,
  } = useStore();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  const activeWorkspace = apiWorkspaces.find((w) => w.id === activeWorkspaceId);

  async function handleNewConversation() {
    if (!activeWorkspaceId) return;
    setMessages([]);
    clearStreaming();
    setIsStreaming(false);
    setActiveConversationId(null);
  }

  function handleSelectConversation(id: string) {
    if (id === activeConversationId) return;
    clearStreaming();
    setIsStreaming(false);
    setActiveConversationId(id);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

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
        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "6px", paddingLeft: "2px" }}>
          Workspace
        </p>
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
            fontFamily: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: "var(--airbnb-rausch)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 2.5h9M1 5.5h6M1 8.5h7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeWorkspace?.name ?? "Loading…"}
            </span>
          </div>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: showWorkspaceMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
            <path d="M2 3.5l3 3 3-3" stroke="var(--airbnb-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {showWorkspaceMenu && (
          <div style={{ marginTop: "4px", background: "var(--airbnb-canvas)", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            {apiWorkspaces.map((ws, i) => {
              const isActive = ws.id === activeWorkspaceId;
              return (
                <button
                  key={ws.id}
                  onClick={() => setShowWorkspaceMenu(false)}
                  style={{ width: "100%", padding: "9px 12px", background: isActive ? "#fff5f7" : "transparent", border: "none", borderBottom: i < apiWorkspaces.length - 1 ? "1px solid var(--airbnb-hairline-soft)" : "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "9px", fontFamily: "inherit" }}
                >
                  <div style={{ width: "5px", flexShrink: 0 }}>
                    {isActive && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--airbnb-rausch)" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 400, color: isActive ? "var(--airbnb-rausch)" : "var(--airbnb-ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ws.name}
                    </span>
                    {ws.description && (
                      <span style={{ fontSize: "11px", color: "var(--airbnb-muted)", display: "block" }}>{ws.description}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: "1px", background: "var(--airbnb-hairline)", margin: "0 12px" }} />

      {/* New conversation button */}
      <div style={{ padding: "12px 12px 10px" }}>
        <button
          onClick={handleNewConversation}
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
            fontFamily: "inherit",
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

      <div style={{ padding: "0 16px 6px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
          Conversations
        </span>
      </div>

      {/* Conversations list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {conversations.length === 0 && (
            <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", textAlign: "center", marginTop: "24px", padding: "0 12px" }}>
              No conversations yet. Ask your first question!
            </p>
          )}
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
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
                  fontFamily: "inherit",
                }}
              >
                {isActive && (
                  <div style={{ position: "absolute", left: 0, top: "8px", bottom: "8px", width: "3px", borderRadius: "0 2px 2px 0", background: "var(--airbnb-rausch)" }} />
                )}
                <p style={{ fontSize: "13px", fontWeight: isActive ? 600 : 400, color: isActive ? "var(--airbnb-ink)" : "var(--airbnb-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0, lineHeight: 1.35 }}>
                  {conv.title ?? "Untitled conversation"}
                </p>
                <span style={{ fontSize: "11px", color: "var(--airbnb-muted)", marginTop: "3px", display: "block" }}>
                  {formatDate(conv.created_at)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom status */}
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--airbnb-hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          <span style={{ fontSize: "11px", color: "var(--airbnb-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            llama3.2 · hybrid retrieval
          </span>
        </div>
      </div>
    </aside>
  );
}
