import { create } from "zustand";
import type { ChatMessage, Workspace } from "./mock-data";
import type { ApiUser, ApiWorkspace, ApiDocument } from "./types";
import { mockWorkspace, mockMessages } from "./mock-data";

type RightTab = "documents" | "pdf";

interface DocQAStore {
  /* ── Auth ──────────────────────────────────────────────── */
  currentUser: ApiUser | null;
  token: string | null;
  setAuth: (user: ApiUser, token: string) => void;
  clearAuth: () => void;

  /* ── Workspaces (live from API, falls back to mock) ─────── */
  apiWorkspaces: ApiWorkspace[];
  setApiWorkspaces: (ws: ApiWorkspace[]) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;

  /* ── Documents (live from API) ──────────────────────────── */
  apiDocuments: ApiDocument[];
  setApiDocuments: (docs: ApiDocument[]) => void;
  addApiDocument: (doc: ApiDocument) => void;
  updateApiDocument: (doc: ApiDocument) => void;

  /* ── Mock workspace (Phase 1 fallback for docs/chat) ────── */
  workspace: Workspace;

  /* ── Conversations ─────────────────────────────────────── */
  selectedConvId: string;
  setSelectedConv: (id: string) => void;
  messages: ChatMessage[];
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string, citations?: ChatMessage["citations"]) => void;

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
    set({ currentUser: null, token: null });
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

  /* Mock fallback */
  workspace: mockWorkspace,

  /* Conversations */
  selectedConvId: mockWorkspace.conversations[0].id,
  setSelectedConv: (id) => set({ selectedConvId: id }),

  messages: mockMessages,
  addUserMessage: (content) => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
  },
  addAssistantMessage: (content, citations) => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content,
      citations,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  /* Right panel */
  rightTab: "documents",
  setRightTab: (tab) => set({ rightTab: tab }),

  /* PDF viewer */
  pdfPage: 36,
  setPdfPage: (page) => set({ pdfPage: page }),
  pdfDocId: null,
  openPdf: (docId, page = 1) => set({ pdfDocId: docId, pdfPage: page, rightTab: "pdf" }),
  closePdf: () => set({ pdfDocId: null, rightTab: "documents" }),

  /* Upload */
  uploadOpen: false,
  setUploadOpen: (open) => set({ uploadOpen: open }),
}));
