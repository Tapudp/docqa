import { create } from "zustand";
import type { ApiUser, ApiWorkspace, ApiDocument, ApiConversation, ApiMessage, Citation } from "./types";

type RightTab = "documents" | "pdf";

interface DocQAStore {
  /* ── Auth ──────────────────────────────────────────────── */
  currentUser: ApiUser | null;
  token: string | null;
  setAuth: (user: ApiUser, token: string) => void;
  clearAuth: () => void;

  /* ── Workspaces ─────────────────────────────────────────── */
  apiWorkspaces: ApiWorkspace[];
  setApiWorkspaces: (ws: ApiWorkspace[]) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;

  /* ── Documents ──────────────────────────────────────────── */
  apiDocuments: ApiDocument[];
  setApiDocuments: (docs: ApiDocument[]) => void;
  addApiDocument: (doc: ApiDocument) => void;
  updateApiDocument: (doc: ApiDocument) => void;
  removeApiDocument: (id: string) => void;

  /* ── Conversations (live from API) ──────────────────────── */
  conversations: ApiConversation[];
  setConversations: (convs: ApiConversation[]) => void;
  addConversation: (conv: ApiConversation) => void;
  removeConversation: (id: string) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;

  /* ── Messages (live from API) ───────────────────────────── */
  messages: ApiMessage[];
  setMessages: (msgs: ApiMessage[]) => void;
  appendMessage: (msg: ApiMessage) => void;

  /* ── Streaming state ────────────────────────────────────── */
  streamingContent: string;
  streamingCitations: Citation[];
  isStreaming: boolean;
  setStreamingContent: (content: string) => void;
  appendStreamingToken: (token: string) => void;
  setStreamingCitations: (citations: Citation[]) => void;
  setIsStreaming: (v: boolean) => void;
  clearStreaming: () => void;

  /* ── Right panel tab ───────────────────────────────────── */
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;

  /* ── PDF viewer ─────────────────────────────────────────── */
  pdfPage: number;
  setPdfPage: (page: number) => void;
  pdfDocId: string | null;
  openPdf: (docId: string, page?: number) => void;
  closePdf: () => void;

  /* ── Upload UI ─────────────────────────────────────────── */
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
}

export const useStore = create<DocQAStore>((set) => ({
  /* Auth */
  currentUser: null,
  token: null,
  setAuth: (user, token) => {
    if (typeof window !== "undefined") localStorage.setItem("docqa_token", token);
    set({ currentUser: user, token });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") localStorage.removeItem("docqa_token");
    set({
      currentUser: null,
      token: null,
      // Reset all workspace-scoped state so the next user starts clean
      apiWorkspaces: [],
      activeWorkspaceId: null,
      apiDocuments: [],
      conversations: [],
      activeConversationId: null,
      messages: [],
      streamingContent: "",
      streamingCitations: [],
      isStreaming: false,
      pdfDocId: null,
      rightTab: "documents",
    });
  },

  /* Workspaces */
  apiWorkspaces: [],
  setApiWorkspaces: (ws) => set({ apiWorkspaces: ws }),
  activeWorkspaceId: null,
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  /* Documents */
  apiDocuments: [],
  setApiDocuments: (docs) => set({ apiDocuments: docs }),
  addApiDocument: (doc) => set((s) => ({ apiDocuments: [doc, ...s.apiDocuments] })),
  updateApiDocument: (doc) => set((s) => ({
    apiDocuments: s.apiDocuments.map((d) => d.id === doc.id ? doc : d),
  })),
  removeApiDocument: (id) => set((s) => ({
    apiDocuments: s.apiDocuments.filter((d) => d.id !== id),
  })),

  /* Conversations */
  conversations: [],
  setConversations: (convs) => set({ conversations: convs }),
  addConversation: (conv) => set((s) => ({ conversations: [conv, ...s.conversations] })),
  removeConversation: (id) => set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),

  /* Messages */
  messages: [],
  setMessages: (msgs) => set({ messages: msgs }),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  /* Streaming */
  streamingContent: "",
  streamingCitations: [],
  isStreaming: false,
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingToken: (token) => set((s) => ({ streamingContent: s.streamingContent + token })),
  setStreamingCitations: (citations) => set({ streamingCitations: citations }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  clearStreaming: () => set({ streamingContent: "", streamingCitations: [], isStreaming: false }),

  /* Right panel */
  rightTab: "documents",
  setRightTab: (tab) => set({ rightTab: tab }),

  /* PDF viewer */
  pdfPage: 1,
  setPdfPage: (page) => set({ pdfPage: page }),
  pdfDocId: null,
  openPdf: (docId, page = 1) => set({ pdfDocId: docId, pdfPage: page, rightTab: "pdf" }),
  closePdf: () => set({ pdfDocId: null, rightTab: "documents" }),

  /* Upload */
  uploadOpen: false,
  setUploadOpen: (open) => set({ uploadOpen: open }),
}));
