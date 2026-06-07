import type { ApiUser, ApiWorkspace, ApiDocument, TokenResponse } from "./types";

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
};

export { ApiError };
