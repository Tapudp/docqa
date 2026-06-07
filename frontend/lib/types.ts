export interface ApiUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string | null;
  parser_config: Record<string, unknown>;
  retrieval_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  member_role: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: ApiUser;
}

export type DocumentStatus = "received" | "parsing" | "parsed" | "chunking" | "indexing" | "ready" | "error";

export interface Citation {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_numbers: number[];
  snippet: string;
}

export interface ApiMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

export interface ApiConversation {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
}

export interface ApiDocument {
  id: string;
  workspace_id: string;
  uploaded_by: string;
  filename: string;
  file_size: number;
  mime_type: string;
  status: DocumentStatus;
  total_pages: number | null;
  parsed_pages: number;
  failed_pages: number[] | null;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
