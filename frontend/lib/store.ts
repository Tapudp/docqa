import { create } from "zustand";
import type { ChatMessage, Workspace } from "./mock-data";
import { mockWorkspace, mockMessages } from "./mock-data";

type RightTab = "documents" | "pdf";

interface DocQAStore {
  /* Workspace */
  workspace: Workspace;

  /* Conversations */
  selectedConvId: string;
  setSelectedConv: (id: string) => void;
  messages: ChatMessage[];
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string, citations?: ChatMessage["citations"]) => void;

  /* Right panel tab */
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;

  /* PDF viewer */
  pdfPage: number;
  setPdfPage: (page: number) => void;
  pdfDocId: string | null;
  openPdf: (docId: string, page?: number) => void;
  closePdf: () => void;

  /* Upload UI */
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
}

export const useStore = create<DocQAStore>((set) => ({
  workspace: mockWorkspace,

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

  rightTab: "documents",
  setRightTab: (tab) => set({ rightTab: tab }),

  pdfPage: 36,
  setPdfPage: (page) => set({ pdfPage: page }),
  pdfDocId: null,
  openPdf: (docId, page = 1) => set({ pdfDocId: docId, pdfPage: page, rightTab: "pdf" }),
  closePdf: () => set({ pdfDocId: null, rightTab: "documents" }),

  uploadOpen: false,
  setUploadOpen: (open) => set({ uploadOpen: open }),
}));
