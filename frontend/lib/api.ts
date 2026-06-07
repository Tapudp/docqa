import type { ApiUser, ApiWorkspace, ApiDocument, ApiConversation, ApiMessage, TokenResponse } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("docqa_token");
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = init.body instanceof FormData;

  const headers: Record<string, string> = {
    // Don't set Content-Type for FormData — browser sets it with the multipart boundary
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Request failed" }));
    const detail = body.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: { msg: string }) => e.msg).join(", ")
          : `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    register: (email: string, password: string, display_name?: string) =>
      request<TokenResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, display_name }),
      }),

    login: (email: string, password: string) =>
      request<TokenResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    me: () => request<ApiUser>("/api/auth/me"),
  },

  workspaces: {
    list: () => request<ApiWorkspace[]>("/api/workspaces"),

    create: (name: string, description?: string) =>
      request<ApiWorkspace>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      }),

    get: (id: string) => request<ApiWorkspace>(`/api/workspaces/${id}`),
  },

  documents: {
    list: (workspaceId: string) =>
      request<ApiDocument[]>(`/api/workspaces/${workspaceId}/documents`),

    upload: (workspaceId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<ApiDocument>(`/api/workspaces/${workspaceId}/documents`, {
        method: "POST",
        body: form,
      });
    },

    get: (documentId: string) =>
      request<ApiDocument>(`/api/documents/${documentId}`),
  },

  chat: {
    createConversation: (workspaceId: string) =>
      request<ApiConversation>(`/api/workspaces/${workspaceId}/conversations`, { method: "POST" }),

    listConversations: (workspaceId: string) =>
      request<ApiConversation[]>(`/api/workspaces/${workspaceId}/conversations`),

    listMessages: (conversationId: string) =>
      request<ApiMessage[]>(`/api/conversations/${conversationId}/messages`),

    streamChat: (conversationId: string, question: string): EventSource => {
      const token = getToken();
      // Use fetch-based SSE via a custom helper — EventSource doesn't support POST
      // We return a controller that mimics EventSource events via callbacks
      throw new Error("use streamChatFetch instead");
    },

    streamChatFetch: async (
      conversationId: string,
      question: string,
      onCitations: (citations: unknown[]) => void,
      onToken: (token: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ): Promise<void> => {
      const token = getToken();
      const res = await fetch(`${BASE}/api/conversations/${conversationId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Request failed" }));
        onError(typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "citations") onCitations(payload.citations);
          else if (payload.type === "token") onToken(payload.content);
          else if (payload.type === "done") onDone();
          else if (payload.type === "error") onError(payload.message);
        }
      }
    },
  },
};

export { ApiError };
