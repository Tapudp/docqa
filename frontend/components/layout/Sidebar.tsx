"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function Sidebar() {
  const {
    apiWorkspaces, activeWorkspaceId, setActiveWorkspaceId,
    currentUser,
    conversations, removeConversation,
    activeConversationId, setActiveConversationId,
    setMessages, clearStreaming, setIsStreaming,
  } = useStore();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [confirmConv, setConfirmConv] = useState<{ id: string; title: string } | null>(null);

  const activeWorkspace = apiWorkspaces.find((w) => w.id === activeWorkspaceId);
  const isAdmin = currentUser?.role === "admin";

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

  function handleDeleteClick(e: { stopPropagation(): void }, conv: { id: string; title: string | null }) {
    e.stopPropagation();
    setConfirmConv({ id: conv.id, title: conv.title ?? "Untitled conversation" });
  }

  async function confirmDelete() {
    if (!confirmConv || deletingConvId) return;
    const { id } = confirmConv;
    setDeletingConvId(id);
    setConfirmConv(null);
    try {
      await api.chat.deleteConversation(id);
      removeConversation(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
        clearStreaming();
      }
    } finally {
      setDeletingConvId(null);
    }
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
    <>
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
                  onClick={() => { setActiveWorkspaceId(ws.id); setShowWorkspaceMenu(false); }}
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
            const isHovered = hoveredConvId === conv.id;
            const isDeleting = deletingConvId === conv.id;
            return (
              <div
                key={conv.id}
                style={{ position: "relative" }}
                onMouseEnter={() => setHoveredConvId(conv.id)}
                onMouseLeave={() => setHoveredConvId(null)}
              >
                <button
                  onClick={() => handleSelectConversation(conv.id)}
                  style={{
                    width: "100%",
                    padding: "9px 10px 9px 13px",
                    paddingRight: isAdmin && isHovered ? "36px" : "10px",
                    borderRadius: "var(--radius-sm)",
                    background: isActive ? "var(--airbnb-canvas)" : "transparent",
                    border: isActive ? "1px solid var(--airbnb-hairline)" : "1px solid transparent",
                    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background-color 0.1s ease, border-color 0.1s ease, padding-right 0.1s ease",
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

                {isAdmin && isHovered && (
                  <button
                    onClick={(e) => handleDeleteClick(e, conv)}
                    disabled={isDeleting}
                    title="Delete conversation"
                    style={{
                      position: "absolute",
                      top: "50%",
                      right: "8px",
                      transform: "translateY(-50%)",
                      width: "22px",
                      height: "22px",
                      borderRadius: "5px",
                      background: isDeleting ? "var(--airbnb-surface-soft)" : "var(--airbnb-canvas)",
                      border: "1px solid var(--airbnb-hairline)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: isDeleting ? "not-allowed" : "pointer",
                      padding: 0,
                      zIndex: 1,
                      transition: "background-color 0.1s ease",
                    }}
                    onMouseEnter={(e) => { if (!isDeleting) { e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.borderColor = "#fca5a5"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--airbnb-canvas)"; e.currentTarget.style.borderColor = "var(--airbnb-hairline)"; }}
                  >
                    {isDeleting ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                        <circle cx="5" cy="5" r="3.5" stroke="#aaa" strokeWidth="1.5" strokeDasharray="5 4" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar: signed-in user */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--airbnb-hairline)", display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "var(--radius-full)", background: "var(--airbnb-rausch)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>
            {(currentUser?.display_name ?? currentUser?.email ?? "?")[0].toUpperCase()}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentUser?.display_name ?? currentUser?.email ?? "…"}
          </p>
          {isAdmin && (
            <span style={{ fontSize: "10px", fontWeight: 600, background: "rgba(255,56,92,0.1)", color: "var(--airbnb-rausch)", borderRadius: "3px", padding: "1px 5px" }}>
              admin
            </span>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </aside>

    {/* Delete confirmation modal */}
    {confirmConv && (
      <>
        {/* Backdrop */}
        <div
          onClick={() => setConfirmConv(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 100,
            backdropFilter: "blur(2px)",
          }}
        />
        {/* Dialog */}
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 101,
            background: "var(--airbnb-canvas)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.10)",
            padding: "28px 28px 24px",
            width: "360px",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          {/* Icon */}
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4.5h14M6.5 4.5V3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1.5M14 4.5l-.9 9.6a1 1 0 0 1-1 .9H5.9a1 1 0 0 1-1-.9L4 4.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--airbnb-ink)", margin: "0 0 8px" }}>
            Delete conversation?
          </p>
          <p style={{ fontSize: "13px", color: "var(--airbnb-body)", margin: "0 0 24px", lineHeight: 1.55 }}>
            &ldquo;{confirmConv.title}&rdquo; and all its messages will be permanently deleted. This cannot be undone.
          </p>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmConv(null)}
              style={{
                height: "36px",
                padding: "0 16px",
                background: "transparent",
                border: "1px solid var(--airbnb-hairline)",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                color: "var(--airbnb-body)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--airbnb-surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              style={{
                height: "36px",
                padding: "0 16px",
                background: "#ef4444",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                fontWeight: 600,
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background-color 0.12s ease, transform 0.1s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#dc2626")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#ef4444")}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              Yes, delete
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
}
