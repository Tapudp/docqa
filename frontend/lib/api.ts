import type { ApiUser, ApiWorkspace, ApiDocument, ApiConversation, ApiMessage, TokenResponse, LLMConfig, OllamaModel, AdminUser, WorkspaceMember, BulkFileResult, RetrievalConfig, TagImportResult } from "./types";

// Empty string = relative URLs → Next.js rewrites proxy to the backend.
// Override NEXT_PUBLIC_API_URL for local dev if running frontend separately (e.g. http://localhost:8000).
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// For SSE streaming only: call the API NodePort directly from the browser to avoid
// Next.js response buffering, which prevents SSE chunks from flushing mid-stream.
// In prod K8s the frontend is on port 30300 and the API NodePort is 30800.
function getDirectApiBase(): string {
  if (typeof window === "undefined") return BASE;
  const { protocol, hostname, port } = window.location;
  if (port === "30300") return `${protocol}//${hostname}:30800`;
  return BASE;
}

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

    setTags: (documentId: string, tags: string[]) =>
      request<ApiDocument>(`/api/documents/${documentId}/tags`, {
        method: "PATCH",
        body: JSON.stringify({ tags }),
      }),

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

    delete: (documentId: string) =>
      request<void>(`/api/documents/${documentId}`, { method: "DELETE" }),
  },

  chat: {
    createConversation: (workspaceId: string) =>
      request<ApiConversation>(`/api/workspaces/${workspaceId}/conversations`, { method: "POST" }),

    listConversations: (workspaceId: string) =>
      request<ApiConversation[]>(`/api/workspaces/${workspaceId}/conversations`),

    listMessages: (conversationId: string) =>
      request<ApiMessage[]>(`/api/conversations/${conversationId}/messages`),


    deleteConversation: (conversationId: string) =>
      request<void>(`/api/conversations/${conversationId}`, { method: "DELETE" }),

    streamChatFetch: async (
      conversationId: string,
      question: string,
      onCitations: (citations: unknown[]) => void,
      onToken: (token: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ): Promise<void> => {
      const token = getToken();
      const res = await fetch(`${getDirectApiBase()}/api/conversations/${conversationId}/chat`, {
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
          else if (payload.type === "done") {
            // Backend sends final deduplicated citations in the done event —
            // update them before clearing the streaming state.
            if (payload.citations) onCitations(payload.citations);
            onDone();
          }
          else if (payload.type === "error") onError(payload.message);
        }
      }
    },
  },

  admin: {
    getRetrievalConfig: () => request<RetrievalConfig>("/api/admin/retrieval/config"),

    updateRetrievalConfig: (cfg: RetrievalConfig) =>
      request<RetrievalConfig>("/api/admin/retrieval/config", {
        method: "PATCH",
        body: JSON.stringify(cfg),
      }),

    getLLMConfig: () => request<LLMConfig>("/api/admin/llm/config"),

    updateLLMConfig: (cfg: Omit<LLMConfig, "api_key"> & { api_key: string }) =>
      request<LLMConfig>("/api/admin/llm/config", {
        method: "PATCH",
        body: JSON.stringify(cfg),
      }),

    listOllamaModels: () => request<OllamaModel[]>("/api/admin/llm/models"),

    listUsers: () => request<AdminUser[]>("/api/admin/users"),

    createUser: (data: { email: string; display_name?: string; password: string; role: string }) =>
      request<AdminUser>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    updateUserRole: (userId: string, role: string) =>
      request<AdminUser>(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),

    setUserActive: (userId: string, active: boolean) =>
      request<AdminUser>(`/api/admin/users/${userId}/active?active=${active}`, {
        method: "PATCH",
      }),

    listMembers: (workspaceId: string) =>
      request<WorkspaceMember[]>(`/api/admin/workspaces/${workspaceId}/members`),

    addMember: (workspaceId: string, userId: string, role: string) =>
      request<WorkspaceMember>(`/api/admin/workspaces/${workspaceId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role }),
      }),

    updateMemberRole: (workspaceId: string, userId: string, role: string) =>
      request<WorkspaceMember>(`/api/admin/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),

    removeMember: (workspaceId: string, userId: string) =>
      request<void>(`/api/admin/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
      }),

    getWorkspaceLLMConfig: (workspaceId: string) =>
      request<LLMConfig>(`/api/admin/workspaces/${workspaceId}/llm`),

    updateWorkspaceLLMConfig: (workspaceId: string, cfg: Omit<LLMConfig, "api_key"> & { api_key: string }) =>
      request<LLMConfig>(`/api/admin/workspaces/${workspaceId}/llm`, {
        method: "PATCH",
        body: JSON.stringify(cfg),
      }),

    clearWorkspaceLLMConfig: (workspaceId: string) =>
      request<void>(`/api/admin/workspaces/${workspaceId}/llm`, { method: "DELETE" }),

    listAllWorkspaces: () =>
      request<ApiWorkspace[]>("/api/admin/workspaces"),

    uploadDocument: (workspaceId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<ApiDocument>(`/api/admin/workspaces/${workspaceId}/documents`, {
        method: "POST",
        body: form,
      });
    },

    uploadZip: (workspaceId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<BulkFileResult[]>(`/api/admin/workspaces/${workspaceId}/bulk-upload-zip`, {
        method: "POST",
        body: form,
      });
    },

    bulkImportTags: (workspaceId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<TagImportResult[]>(`/api/admin/workspaces/${workspaceId}/documents/tags/bulk`, {
        method: "POST",
        body: form,
      });
    },
  },
};

export { ApiError };
