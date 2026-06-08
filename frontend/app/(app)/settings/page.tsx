"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api";
import type { LLMConfig, OllamaModel, AdminUser } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const currentUser = useStore((s) => s.currentUser);

  // Redirect non-admins
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") router.replace("/workspace");
  }, [currentUser, router]);

  if (!currentUser || currentUser.role !== "admin") return null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--airbnb-canvas)", overflow: "hidden" }}>
      {/* Sidebar */}
      <nav style={{ width: "220px", minWidth: "220px", borderRight: "1px solid var(--airbnb-hairline)", background: "var(--airbnb-surface-soft)", display: "flex", flexDirection: "column", padding: "20px 12px" }}>
        <Link href="/workspace" style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 10px", borderRadius: "var(--radius-sm)", textDecoration: "none", marginBottom: "16px", color: "var(--airbnb-muted)", fontSize: "13px" }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 2L4 6.5l4 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to workspace
        </Link>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.7px", padding: "0 10px", marginBottom: "4px" }}>Settings</p>
        <NavItem href="#llm" label="LLM Configuration" icon="⚙" />
        <NavItem href="#users" label="User Management" icon="👥" />
        <NavItem href="#workspaces" label="Workspaces" icon="◫" />
      </nav>

      {/* Content */}
      <main style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--airbnb-ink)", marginBottom: "32px" }}>Admin Settings</h1>
        <LLMSection />
        <div style={{ height: "1px", background: "var(--airbnb-hairline)", margin: "40px 0" }} />
        <UsersSection currentUserId={currentUser.id} />
        <div style={{ height: "1px", background: "var(--airbnb-hairline)", margin: "40px 0" }} />
        <WorkspacesSection />
      </main>
    </div>
  );
}

/* ── Nav item ─────────────────────────────────────────────── */

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a
      href={href}
      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "var(--radius-sm)", textDecoration: "none", color: "var(--airbnb-body)", fontSize: "13px", marginBottom: "2px" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--airbnb-surface-strong)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: "13px", width: "16px", textAlign: "center" }}>{icon}</span>
      {label}
    </a>
  );
}

/* ── LLM Configuration ────────────────────────────────────── */

const PROVIDERS = [
  { value: "ollama", label: "Ollama (local / on-prem)" },
  { value: "openai", label: "OpenAI" },
  { value: "groq", label: "Groq (OpenAI-compatible)" },
  { value: "together", label: "Together.ai (OpenAI-compatible)" },
];

function LLMSection() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.getLLMConfig()
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);

  async function fetchModels() {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await api.admin.listOllamaModels();
      setModels(list);
    } catch (e) {
      setModelsError(e instanceof ApiError ? e.message : "Could not reach Ollama");
    } finally {
      setLoadingModels(false);
    }
  }

  useEffect(() => {
    if (config?.provider === "ollama") fetchModels();
  }, [config?.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.admin.updateLLMConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function formatSize(bytes: number) {
    if (!bytes) return "";
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  }

  if (!config) {
    return (
      <section id="llm">
        <SectionHeader title="LLM Configuration" subtitle="Configure which language model DocQA uses to answer questions." />
        <p style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>{error ?? "Loading…"}</p>
      </section>
    );
  }

  return (
    <section id="llm">
      <SectionHeader title="LLM Configuration" subtitle="Configure which language model DocQA uses to answer questions. Changes take effect immediately — no restart needed." />

      <div style={{ display: "grid", gap: "20px", maxWidth: "540px" }}>

        {/* Provider */}
        <Field label="Provider">
          <select
            value={config.provider}
            onChange={(e) => setConfig({ ...config, provider: e.target.value })}
            style={selectStyle}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>

        {/* Base URL */}
        <Field label="Base URL" hint={config.provider === "ollama" ? "e.g. http://host.docker.internal:11434" : "Leave blank to use provider default"}>
          <input
            value={config.base_url}
            onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
            placeholder={config.provider === "ollama" ? "http://host.docker.internal:11434" : "https://api.openai.com"}
            style={inputStyle}
          />
        </Field>

        {/* Model */}
        <Field label="Model">
          {config.provider === "ollama" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {models.length > 0 ? (
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  style={selectStyle}
                >
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}{m.parameter_size ? ` (${m.parameter_size})` : ""}{m.size ? ` — ${formatSize(m.size)}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  placeholder="llama3.2"
                  style={inputStyle}
                />
              )}
              <button
                onClick={fetchModels}
                disabled={loadingModels}
                style={{ ...ghostBtnStyle, alignSelf: "flex-start" }}
              >
                {loadingModels ? "Fetching…" : "↺ Refresh installed models"}
              </button>
              {modelsError && <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{modelsError}</p>}
            </div>
          ) : (
            <input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="gpt-4o-mini"
              style={inputStyle}
            />
          )}
        </Field>

        {/* API Key (non-Ollama only) */}
        {config.provider !== "ollama" && (
          <Field label="API Key" hint="Stored encrypted. Shown masked after saving.">
            <input
              type="password"
              value={config.api_key}
              onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
              placeholder="sk-…"
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>
        )}

        {error && <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...primaryBtnStyle, width: "fit-content" }}
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save configuration"}
        </button>
      </div>
    </section>
  );
}

/* ── User Management ──────────────────────────────────────── */

function UsersSection({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    api.admin.listUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(userId: string, role: string) {
    setUpdating(userId);
    try {
      const updated = await api.admin.updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: updated.role } : u));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section id="users">
      <SectionHeader title="User Management" subtitle="Manage roles for all registered users. Only admins can create workspaces and access settings." />

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>Loading…</p>
      ) : (
        <div style={{ border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", overflow: "hidden", maxWidth: "640px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--airbnb-surface-soft)" }}>
                <Th>User</Th>
                <Th>Joined</Th>
                <Th>Role</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderTop: i > 0 ? "1px solid var(--airbnb-hairline)" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ margin: 0, fontWeight: 500, color: "var(--airbnb-ink)" }}>{u.display_name ?? u.email}</p>
                    {u.display_name && <p style={{ margin: 0, fontSize: "11px", color: "var(--airbnb-muted)" }}>{u.email}</p>}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--airbnb-muted)", whiteSpace: "nowrap" }}>
                    {new Date(u.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {u.id === currentUserId ? (
                      <RoleBadge role={u.role} />
                    ) : (
                      <select
                        value={u.role}
                        disabled={updating === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        style={{ ...selectStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                        <option value="viewer">viewer</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Workspaces ───────────────────────────────────────────── */

function WorkspacesSection() {
  const { apiWorkspaces } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setApiWorkspaces = useStore((s) => s.setApiWorkspaces);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const ws = await api.workspaces.create(name.trim(), description.trim() || undefined);
      setApiWorkspaces([...apiWorkspaces, ws]);
      setName("");
      setDescription("");
      setCreating(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="workspaces">
      <SectionHeader
        title="Workspaces"
        subtitle="Only admins can create workspaces. Documents are fully isolated between workspaces."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "480px", marginBottom: "16px" }}>
        {apiWorkspaces.map((ws) => (
          <div key={ws.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", background: "var(--airbnb-canvas)" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 500, color: "var(--airbnb-ink)", fontSize: "14px" }}>{ws.name}</p>
              {ws.description && <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--airbnb-muted)" }}>{ws.description}</p>}
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", background: "var(--airbnb-surface-strong)", color: "var(--airbnb-muted)" }}>
              {ws.member_role ?? "member"}
            </span>
          </div>
        ))}
      </div>

      {!creating ? (
        <button onClick={() => setCreating(true)} style={{ ...primaryBtnStyle }}>
          + New workspace
        </button>
      ) : (
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "12px", maxWidth: "400px", padding: "16px", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", background: "var(--airbnb-surface-soft)" }}>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Papers"
              required
              style={inputStyle}
              autoFocus
            />
          </Field>
          <Field label="Description (optional)">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description…"
              style={inputStyle}
            />
          </Field>
          {error && <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>{saving ? "Creating…" : "Create"}</button>
            <button type="button" onClick={() => setCreating(false)} style={ghostBtnStyle}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ── Reusable sub-components ──────────────────────────────── */

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--airbnb-ink)", margin: "0 0 4px" }}>{title}</h2>
      <p style={{ fontSize: "13px", color: "var(--airbnb-muted)", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--airbnb-ink)" }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--airbnb-muted)", marginLeft: "6px" }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {children}
    </th>
  );
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: "rgba(255,56,92,0.1)", color: "var(--airbnb-rausch)" },
  member: { bg: "rgba(34,197,94,0.1)", color: "#16a34a" },
  viewer: { bg: "var(--airbnb-surface-strong)", color: "var(--airbnb-muted)" },
};

function RoleBadge({ role }: { role: string }) {
  const colors = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: colors.bg, color: colors.color }}>
      {role}
    </span>
  );
}

/* ── Shared styles ────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "38px",
  padding: "0 12px",
  border: "1px solid var(--airbnb-hairline)",
  borderRadius: "var(--radius-sm)",
  fontSize: "13px",
  color: "var(--airbnb-ink)",
  background: "var(--airbnb-canvas)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "auto",
};

const primaryBtnStyle: React.CSSProperties = {
  height: "36px",
  padding: "0 16px",
  background: "var(--airbnb-rausch)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  fontSize: "13px",
  fontWeight: 500,
  color: "white",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtnStyle: React.CSSProperties = {
  height: "36px",
  padding: "0 14px",
  background: "transparent",
  border: "1px solid var(--airbnb-hairline)",
  borderRadius: "var(--radius-sm)",
  fontSize: "13px",
  color: "var(--airbnb-body)",
  cursor: "pointer",
  fontFamily: "inherit",
};
