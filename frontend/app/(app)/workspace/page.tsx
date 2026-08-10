"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { ApiMessage, Citation } from "@/lib/types";
import Sidebar from "@/components/layout/Sidebar";
import RightPanel from "@/components/layout/PDFViewerPanel";
import ChatMessage from "@/components/chat/ChatMessage";
import TypingIndicator from "@/components/chat/TypingIndicator";
import UploadZone from "@/components/documents/UploadZone";
import BulkUploadModal from "@/components/documents/BulkUploadModal";
import WorkspaceLibrary from "@/components/documents/WorkspaceLibrary";

export default function WorkspacePage() {
  const router = useRouter();
  const {
    uploadOpen, bulkUploadOpen, setBulkUploadOpen,
    currentUser, clearAuth,
    apiWorkspaces, setApiWorkspaces, activeWorkspaceId, setActiveWorkspaceId,
    setApiDocuments, updateApiDocument, apiDocuments,
    conversations, setConversations, addConversation,
    activeConversationId, setActiveConversationId,
    messages, setMessages, appendMessage,
    streamingContent, streamingCitations, isStreaming,
    appendStreamingToken, setStreamingCitations, setIsStreaming, clearStreaming,
    viewMode,
  } = useStore();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const displayName = currentUser?.display_name || currentUser?.email?.split("@")[0] || "User";
  const avatarInitial = displayName[0].toUpperCase();

  // Fetch workspaces on mount, set first as active
  useEffect(() => {
    api.workspaces.list().then((workspaces) => {
      setApiWorkspaces(workspaces);
      if (workspaces.length === 0) return;
      // Always pick from this user's workspace list — stale activeWorkspaceId from a
      // previous session may point to a workspace the current user can't access
      const currentId = useStore.getState().activeWorkspaceId;
      const stillValid = workspaces.some((w) => w.id === currentId);
      if (!stillValid) setActiveWorkspaceId(workspaces[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload documents + conversations whenever active workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setApiDocuments([]);
    setConversations([]);
    setMessages([]);
    setActiveConversationId(null);
    clearStreaming();
    api.documents.list(activeWorkspaceId).then(setApiDocuments).catch(() => {});
    api.chat.listConversations(activeWorkspaceId).then(setConversations).catch(() => {});
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll in-progress documents every 2s
  useEffect(() => {
    const PROCESSING = ["received", "parsing", "chunking", "indexing"];
    const interval = setInterval(async () => {
      const inProgress = useStore.getState().apiDocuments.filter((d) => PROCESSING.includes(d.status));
      for (const doc of inProgress) {
        try { updateApiDocument(await api.documents.get(doc.id)); } catch {}
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) { setMessages([]); return; }
    api.chat.listMessages(activeConversationId).then(setMessages).catch(() => {});
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming || !activeWorkspaceId) return;
    setInput("");

    // Create conversation on first message
    let convId = activeConversationId;
    if (!convId) {
      const conv = await api.chat.createConversation(activeWorkspaceId);
      addConversation(conv);
      setActiveConversationId(conv.id);
      convId = conv.id;
    }

    // Optimistically add user message to UI
    const tempUserMsg: ApiMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: convId,
      role: "user",
      content: text,
      citations: null,
      created_at: new Date().toISOString(),
    };
    appendMessage(tempUserMsg);
    setThinking(true);

    setIsStreaming(true);
    clearStreaming();

    await api.chat.streamChatFetch(
      convId,
      text,
      (citations) => {
        setStreamingCitations(citations as Citation[]);
      },
      (token) => {
        appendStreamingToken(token);
      },
      async () => {
        setThinking(false);
        setIsStreaming(false);
        clearStreaming();
        try {
          const updated = await api.chat.listMessages(convId!);
          setMessages(updated);
        } catch {}
      },
      (err) => {
        setThinking(false);
        setIsStreaming(false);
        clearStreaming();
        console.error("Chat error:", err);
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const readyDocCount = apiDocuments.filter((d) => d.status === "ready").length;
  const workspacesLoaded = apiWorkspaces.length > 0 || activeWorkspaceId !== null;

  // No workspaces assigned — show a holding page instead of a broken UI
  if (workspacesLoaded && apiWorkspaces.length === 0) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--airbnb-canvas)", flexDirection: "column", gap: "12px" }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="4" y="4" width="32" height="32" rx="8" stroke="var(--airbnb-hairline)" strokeWidth="2" />
          <path d="M13 20h14M13 14h8M13 26h10" stroke="var(--airbnb-muted)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--airbnb-ink)", margin: 0 }}>No workspaces yet</p>
        <p style={{ fontSize: "13px", color: "var(--airbnb-muted)", margin: 0, textAlign: "center", maxWidth: "320px" }}>
          You haven&apos;t been added to any workspace. Ask your administrator to add you.
        </p>
        <button onClick={handleLogout} style={{ marginTop: "8px", height: "36px", padding: "0 16px", background: "transparent", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", fontSize: "13px", cursor: "pointer", color: "var(--airbnb-muted)", fontFamily: "inherit" }}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Top nav */}
      <header
        style={{
          height: "52px",
          flexShrink: 0,
          background: "var(--airbnb-canvas)",
          borderBottom: "1px solid var(--airbnb-hairline)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              background: "var(--airbnb-rausch)",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3h9M2 6.5h6M2 10h7" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--airbnb-ink)", letterSpacing: "-0.2px" }}>
            REVERB by NpuDen
          </span>
        </div>

        <div style={{ width: "1px", height: "18px", background: "var(--airbnb-hairline)" }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--airbnb-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {viewMode === "library" ? "Document Library" : (activeConv?.title ?? "New conversation")}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "var(--airbnb-muted)", background: "var(--airbnb-surface-soft)", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-full)", padding: "3px 10px", whiteSpace: "nowrap" }}>
            hybrid retrieval
          </span>

          {currentUser?.role === "admin" && (
            <button
              onClick={() => setBulkUploadOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                height: "32px", padding: "0 14px",
                background: "var(--airbnb-ink)", border: "none",
                borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600,
                color: "white", cursor: "pointer", fontFamily: "inherit",
                transition: "opacity 0.12s ease, transform 0.1s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3 5l3-4 3 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 9v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Bulk Upload
            </button>
          )}

          <div style={{ width: "1px", height: "18px", background: "var(--airbnb-hairline)" }} />

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                padding: "4px 10px 4px 4px",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--airbnb-hairline)",
                background: "var(--airbnb-canvas)",
                transition: "box-shadow 0.15s ease",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px var(--airbnb-hairline)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ width: "28px", height: "28px", borderRadius: "var(--radius-full)", background: "var(--airbnb-rausch)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "white" }}>{avatarInitial}</span>
              </div>
              <div style={{ lineHeight: 1, textAlign: "left" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)", margin: 0 }}>{displayName}</p>
                <p style={{ fontSize: "11px", color: "var(--airbnb-muted)", margin: "2px 0 0" }}>{currentUser?.role ?? "viewer"}</p>
              </div>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: "2px" }}>
                <path d="M2 4l3 3 3-3" stroke="#6a6a6a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {userMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setUserMenuOpen(false)} />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    zIndex: 50,
                    background: "var(--airbnb-canvas)",
                    border: "1px solid var(--airbnb-hairline)",
                    borderRadius: "var(--radius-sm)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                    minWidth: "180px",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--airbnb-hairline)" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)", margin: 0 }}>{displayName}</p>
                    <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: "2px 0 0" }}>{currentUser?.email}</p>
                  </div>
                  {currentUser?.role === "admin" && (
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 14px", textDecoration: "none", fontSize: "14px", color: "var(--airbnb-body)", background: "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--airbnb-surface-soft)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M6.5 1v1.2M6.5 10.8V12M1 6.5h1.2M10.8 6.5H12M2.64 2.64l.85.85M9.51 9.51l.85.85M9.51 3.49l-.85.85M3.49 9.51l-.85.85" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      Settings
                    </Link>
                  )}
                  <div style={{ height: "1px", background: "var(--airbnb-hairline)" }} />
                  <button
                    onClick={handleLogout}
                    style={{ width: "100%", padding: "10px 14px", textAlign: "left", fontSize: "14px", color: "var(--airbnb-error)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--airbnb-surface-soft)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body: 3-column */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Sidebar />

        {viewMode === "library" ? (
          <WorkspaceLibrary />
        ) : (
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fafafa" }}>
            {/* Messages scroll */}
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "28px 40px" }}>
              {messages.length === 0 && !isStreaming && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", paddingBottom: "80px" }}>
                  <div style={{ width: "52px", height: "52px", borderRadius: "var(--radius-full)", background: "var(--airbnb-surface-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <path d="M19 13a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" stroke="#c1c1c1" strokeWidth="1.6" fill="none" />
                    </svg>
                  </div>
                  <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--airbnb-muted)" }}>Ask anything about your documents</p>
                  <p style={{ fontSize: "13px", color: "var(--airbnb-muted-soft)" }}>Answers come with page citations — click to view the source</p>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "720px", margin: "0 auto" }}>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

                {thinking && <TypingIndicator />}

                {!thinking && isStreaming && streamingContent && (
                  <ChatMessage
                    message={{
                      id: "streaming",
                      conversation_id: activeConversationId ?? "",
                      role: "assistant",
                      content: streamingContent,
                      citations: streamingCitations.length > 0 ? streamingCitations : null,
                      created_at: new Date().toISOString(),
                    }}
                    isStreaming
                  />
                )}

                <div ref={chatBottomRef} />
              </div>
            </div>

            {/* Input bar */}
            <div style={{ borderTop: "1px solid var(--airbnb-hairline)", padding: "14px 40px 18px", background: "var(--airbnb-canvas)" }}>
              <div
                style={{
                  maxWidth: "720px",
                  margin: "0 auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "var(--airbnb-canvas)",
                  border: "1px solid var(--airbnb-hairline)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px 10px 16px",
                  boxShadow: "var(--shadow-card)",
                  transition: "border-color 0.15s ease",
                }}
                onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-ink)"; }}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-hairline)"; }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={readyDocCount === 0 ? "Upload and index documents first…" : "Ask a question about your documents…"}
                  disabled={isStreaming || readyDocCount === 0}
                  rows={1}
                  style={{
                    flex: 1,
                    resize: "none",
                    border: "none",
                    outline: "none",
                    fontSize: "15px",
                    lineHeight: "1.5",
                    color: "var(--airbnb-ink)",
                    background: "transparent",
                    maxHeight: "160px",
                    padding: 0,
                    fontFamily: "inherit",
                    opacity: readyDocCount === 0 ? 0.5 : 1,
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming || readyDocCount === 0}
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "var(--radius-full)",
                    background: (!input.trim() || isStreaming || readyDocCount === 0) ? "var(--airbnb-surface-strong)" : "var(--airbnb-rausch)",
                    border: "none",
                    cursor: (!input.trim() || isStreaming || readyDocCount === 0) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background-color 0.12s ease, transform 0.1s ease",
                  }}
                  onMouseDown={(e) => { if (input.trim()) e.currentTarget.style.transform = "scale(0.92)"; }}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M1.5 7h11M8.5 3l4 4-4 4"
                      stroke={(!input.trim() || isStreaming) ? "#929292" : "white"}
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <p style={{ textAlign: "center", fontSize: "11px", color: "var(--airbnb-muted-soft)", marginTop: "8px" }}>
                {readyDocCount} document{readyDocCount !== 1 ? "s" : ""} indexed · hybrid retrieval · Enter to send
              </p>
            </div>
          </main>
        )}

        <RightPanel />
      </div>

      {uploadOpen && <UploadZone />}
      {bulkUploadOpen && <BulkUploadModal />}

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes typing-bounce { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        }
      `}</style>
    </>
  );
}
