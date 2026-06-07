export type DocumentStatus =
  | "ready"
  | "partial"
  | "parsing"
  | "indexing"
  | "error";

export interface DocFile {
  id: string;
  name: string;
  totalPages: number;
  parsedPages: number;
  totalChunks: number;
  indexedChunks: number;
  status: DocumentStatus;
  uploadedBy: string;
  uploadedAt: string;
  sizeKb: number;
  failedPages?: number[];
}

export interface Citation {
  pageNumber: number;
  documentId: string;
  documentName: string;
  excerpt?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  documents: DocFile[];
  conversations: ConversationSummary[];
  parser: string;
  llm: string;
  retrievalMode: "hybrid" | "bm25" | "vector";
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/* ── Mock Documents ─────────────────────────────────────── */

export const mockDocuments: DocFile[] = [
  {
    id: "doc-1",
    name: "GFR-2024.pdf",
    totalPages: 50,
    parsedPages: 50,
    totalChunks: 180,
    indexedChunks: 180,
    status: "ready",
    uploadedBy: "Divyesh",
    uploadedAt: "2 hours ago",
    sizeKb: 12288,
  },
  {
    id: "doc-2",
    name: "HR-Policy-v3.pdf",
    totalPages: 24,
    parsedPages: 24,
    totalChunks: 88,
    indexedChunks: 88,
    status: "ready",
    uploadedBy: "Priya",
    uploadedAt: "Yesterday",
    sizeKb: 3412,
  },
  {
    id: "doc-3",
    name: "Procurement-Manual.pdf",
    totalPages: 38,
    parsedPages: 36,
    totalChunks: 124,
    indexedChunks: 124,
    status: "partial",
    uploadedBy: "Arjun",
    uploadedAt: "3 days ago",
    sizeKb: 8760,
    failedPages: [22, 31],
  },
  {
    id: "doc-4",
    name: "Legal-Contracts-Q1.pdf",
    totalPages: 12,
    parsedPages: 12,
    totalChunks: 42,
    indexedChunks: 42,
    status: "ready",
    uploadedBy: "Meera",
    uploadedAt: "1 week ago",
    sizeKb: 2048,
  },
  {
    id: "doc-5",
    name: "Engineering-Specs-2026.pdf",
    totalPages: 72,
    parsedPages: 72,
    totalChunks: 0,
    indexedChunks: 0,
    status: "parsing",
    uploadedBy: "Siddharth",
    uploadedAt: "Just now",
    sizeKb: 18432,
  },
];

/* ── Mock Chat Messages ──────────────────────────────────── */

export const mockMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "What does Rule 155 say about procurement of goods above the threshold limit?",
    createdAt: "10:24 AM",
  },
  {
    id: "msg-2",
    role: "assistant",
    content:
      "Rule 155 of the General Financial Rules 2024 governs the procurement of goods valued above the threshold limit. It mandates that all procurement above ₹2,00,000 must be conducted through an open tender process published on the Government e-Marketplace (GeM) or through approved procurement channels.\n\nThe rule further specifies that:\n\n1. A Purchase Committee of at least three officers must approve procurement exceeding ₹5,00,000.\n2. All bids must remain open for a minimum of 21 days before the deadline.\n3. Financial concurrence from the Finance Division is mandatory for procurements above ₹10,00,000.\n\nThis ensures transparency and prevents unauthorized single-source procurement.",
    citations: [
      { pageNumber: 36, documentId: "doc-1", documentName: "GFR-2024.pdf", excerpt: "Rule 155: Procurement of goods above the threshold..." },
      { pageNumber: 37, documentId: "doc-1", documentName: "GFR-2024.pdf", excerpt: "...Purchase Committee requirements and bid duration..." },
      { pageNumber: 41, documentId: "doc-1", documentName: "GFR-2024.pdf", excerpt: "...Finance Division concurrence for high-value procurement..." },
    ],
    createdAt: "10:24 AM",
  },
  {
    id: "msg-3",
    role: "user",
    content: "Are there any exceptions to this rule for emergency procurement?",
    createdAt: "10:26 AM",
  },
  {
    id: "msg-4",
    role: "assistant",
    content:
      "Yes, Rule 155 provides specific emergency procurement exceptions. Under clause 155(3), competent authority may authorize direct procurement without tender in the following circumstances:\n\n- **Natural disasters or national emergencies** declared by the central or state government\n- **Operational necessity** where delay would cause significant loss to public interest\n- **Sole-source availability** where only one supplier can meet technical specifications\n\nIn all emergency cases, post-facto approval from the next higher authority must be obtained within 30 days of the procurement decision, along with a detailed justification note.",
    citations: [
      { pageNumber: 38, documentId: "doc-1", documentName: "GFR-2024.pdf", excerpt: "Rule 155(3): Emergency procurement exceptions..." },
    ],
    createdAt: "10:26 AM",
  },
];

/* ── Mock Workspace ──────────────────────────────────────── */

export const mockWorkspace: Workspace = {
  id: "ws-1",
  name: "HR Policies",
  slug: "hr-policies",
  description: "Human resources policies, procedures, and compliance documents",
  documents: mockDocuments,
  conversations: [
    { id: "conv-1", title: "Rule 155 Procurement Query", updatedAt: "10:26 AM", messageCount: 4 },
    { id: "conv-2", title: "Leave policy clarification", updatedAt: "Yesterday", messageCount: 8 },
    { id: "conv-3", title: "TA/DA entitlement check", updatedAt: "2 days ago", messageCount: 3 },
  ],
  parser: "PaddleOCR",
  llm: "qwen3.5:35b",
  retrievalMode: "hybrid",
};

export const mockWorkspaces: Pick<Workspace, "id" | "name" | "slug" | "description">[] = [
  { id: "ws-1", name: "HR Policies", slug: "hr-policies", description: "HR policies and procedures" },
  { id: "ws-2", name: "Engineering Docs", slug: "engineering-docs", description: "Technical specs and manuals" },
  { id: "ws-3", name: "Legal Contracts", slug: "legal-contracts", description: "Legal agreements and compliance" },
];
