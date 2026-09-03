"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api";
import type { LLMConfig, OllamaModel, AdminUser, WorkspaceMember, ApiWorkspace, RetrievalConfig } from "@/lib/types";

type Section = "llm" | "retrieval" | "users" | "workspaces";

export default function SettingsPage() {
  const router = useRouter();
  const currentUser = useStore((s) => s.currentUser);
  const [activeSection, setActiveSection] = useState<Section>("llm");

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") router.replace("/workspace");
  }, [currentUser, router]);

  if (!currentUser || currentUser.role !== "admin") return null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--airbnb-canvas)", overflow: "hidden" }}>
      {/* ── Sidebar nav ─────────────────────────────────── */}
      <nav style={{ width: "220px", minWidth: "220px", borderRight: "1px solid var(--airbnb-hairline)", background: "var(--airbnb-surface-soft)", display: "flex", flexDirection: "column", padding: "20px 12px" }}>
        <Link
          href="/workspace"
          style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 10px", borderRadius: "var(--radius-sm)", textDecoration: "none", marginBottom: "16px", color: "var(--airbnb-muted)", fontSize: "13px" }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 2L4 6.5l4 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to workspace
        </Link>

        <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.7px", padding: "0 10px", marginBottom: "4px" }}>Settings</p>

        {(
          [
            { id: "llm", label: "LLM Configuration", icon: "M10 3H3v7h7V3zM7 9H4V6h3v3z" },
            { id: "retrieval", label: "Retrieval Config", icon: "M2 5h9M2 8h6M2 11h4M11 8l2 2-2 2" },
            { id: "users", label: "Users", icon: "M6.5 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 11c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4" },
            { id: "workspaces", label: "Workspaces & Members", icon: "M1.5 3h9v7h-9zM7 10v2.5M4.5 10v2.5M5.75 12.5h2" },
          ] as { id: Section; label: string; icon: string }[]
        ).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 10px", borderRadius: "var(--radius-sm)",
              border: "none", cursor: "pointer", textAlign: "left",
              fontSize: "13px", fontWeight: activeSection === id ? 600 : 400,
              color: activeSection === id ? "var(--airbnb-ink)" : "var(--airbnb-body)",
              background: activeSection === id ? "var(--airbnb-canvas)" : "transparent",
              width: "100%", marginBottom: "2px",
              fontFamily: "inherit",
              boxShadow: activeSection === id ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "background 0.1s ease, color 0.1s ease",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <path d={icon} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            {label}
          </button>
        ))}
      </nav>

      {/* ── Main content ─────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "32px 40px", maxWidth: "860px" }}>
        {activeSection === "llm" && <LLMSection />}
        {activeSection === "retrieval" && <RetrievalSection />}
        {activeSection === "users" && <UsersSection currentUserId={currentUser.id} />}
        {activeSection === "workspaces" && <WorkspacesSection />}
      </main>
    </div>
  );
}


/* ── LLM Configuration ──────────────────────────────────────── */

const PROVIDERS = [
  { value: "vllm", label: "vLLM (local / on-prem, GPU)" },
  { value: "ollama", label: "Ollama (local / on-prem)" },
  { value: "openai", label: "OpenAI" },
  { value: "groq", label: "Groq (OpenAI-compatible)" },
  { value: "together", label: "Together.ai (OpenAI-compatible)" },
];

// Providers that run on our own cluster: model list is fetched from the server,
// no API key needed.
const LOCAL_PROVIDERS = new Set(["ollama", "vllm"]);

function LLMSection() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.getLLMConfig().then(setConfig).catch((e) => setError(e.message));
  }, []);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      setModels(await api.admin.listOllamaModels());
    } catch (e) {
      setModelsError(e instanceof ApiError ? e.message : "Could not reach Ollama");
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (config && LOCAL_PROVIDERS.has(config.provider)) fetchModels();
  }, [config?.provider, fetchModels]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      setConfig(await api.admin.updateLLMConfig(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return (
    <section>
      <SectionHeader title="LLM Configuration" subtitle="Configure which language model REVERB uses to answer questions." />
      <p style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>{error ?? "Loading…"}</p>
    </section>
  );

  return (
    <section>
      <SectionHeader title="LLM Configuration" subtitle="Configure which language model REVERB uses. Changes take effect immediately — no restart needed." />
      <div style={{ display: "grid", gap: "20px", maxWidth: "540px" }}>
        <Field label="Provider">
          <select value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} style={selectStyle}>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Base URL" hint={config.provider === "vllm" ? "e.g. http://172.16.200.123:30901" : config.provider === "ollama" ? "e.g. http://host.docker.internal:11434" : "Leave blank for provider default"}>
          <input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Model">
          {LOCAL_PROVIDERS.has(config.provider) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {models.length > 0
                ? <select value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} style={selectStyle}>
                    {models.map((m) => <option key={m.name} value={m.name}>{m.name}{m.parameter_size ? ` (${m.parameter_size})` : ""}</option>)}
                  </select>
                : <input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder="llama3.2" style={inputStyle} />
              }
              <button onClick={fetchModels} disabled={loadingModels} style={{ ...ghostBtnStyle, alignSelf: "flex-start" }}>
                {loadingModels ? "Fetching…" : "↺ Refresh installed models"}
              </button>
              {modelsError && <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{modelsError}</p>}
            </div>
          ) : (
            <input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder="gpt-4o-mini" style={inputStyle} />
          )}
        </Field>
        {!LOCAL_PROVIDERS.has(config.provider) && (
          <Field label="API Key" hint="Shown masked after saving.">
            <input type="password" value={config.api_key} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} placeholder="sk-…" style={inputStyle} autoComplete="new-password" />
          </Field>
        )}
        {error && <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{error}</p>}
        <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle, width: "fit-content" }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save configuration"}
        </button>
      </div>
    </section>
  );
}


/* ── Retrieval Configuration ───────────────────────────────── */

const HARDWARE_PRESETS = [
  {
    label: "Single GPU (7–13B)",
    description: "RTX 3090/4090, A10 · 16–24 GB VRAM",
    values: { top_k: 10, inner_k_multiplier: 5, chunk_size: 1200, chunk_overlap: 200, multi_query: true },
  },
  {
    label: "A40 / A100 (26–34B)",
    description: "A40, A100 · 40–80 GB VRAM  ← current nid-practice",
    values: { top_k: 15, inner_k_multiplier: 5, chunk_size: 1500, chunk_overlap: 300, multi_query: true },
  },
  {
    label: "Dual H100 (70B)",
    description: "2× H100 SXM · 160 GB VRAM",
    values: { top_k: 35, inner_k_multiplier: 10, chunk_size: 2000, chunk_overlap: 400, multi_query: true },
  },
  {
    label: "H100 Cluster (405B+)",
    description: "4+ H100/H200 · 320+ GB VRAM",
    values: { top_k: 75, inner_k_multiplier: 15, chunk_size: 2500, chunk_overlap: 500, multi_query: true },
  },
];

const DEFAULTS: RetrievalConfig = {
  top_k: 15,
  inner_k_multiplier: 5,
  chunk_size: 1500,
  chunk_overlap: 300,
  multi_query: true,
};

function RetrievalSection() {
  const [config, setConfig] = useState<RetrievalConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reindexWarning, setReindexWarning] = useState(false);
  const [origChunking, setOrigChunking] = useState({ chunk_size: 0, chunk_overlap: 0 });

  useEffect(() => {
    api.admin.getRetrievalConfig()
      .then((cfg) => {
        setConfig(cfg);
        setOrigChunking({ chunk_size: cfg.chunk_size, chunk_overlap: cfg.chunk_overlap });
      })
      .catch(() => {
        setConfig(DEFAULTS);
        setOrigChunking({ chunk_size: DEFAULTS.chunk_size, chunk_overlap: DEFAULTS.chunk_overlap });
      });
  }, []);

  function applyPreset(preset: typeof HARDWARE_PRESETS[0]) {
    setConfig(preset.values);
    setReindexWarning(
      preset.values.chunk_size !== origChunking.chunk_size ||
      preset.values.chunk_overlap !== origChunking.chunk_overlap
    );
  }

  function handleChange(key: keyof RetrievalConfig, value: number | boolean) {
    if (!config) return;
    const next = { ...config, [key]: value };
    setConfig(next);
    if (key === "chunk_size" || key === "chunk_overlap") {
      setReindexWarning(
        next.chunk_size !== origChunking.chunk_size ||
        next.chunk_overlap !== origChunking.chunk_overlap
      );
    }
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const saved_ = await api.admin.updateRetrievalConfig(config);
      setConfig(saved_);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return (
    <section>
      <SectionHeader title="Retrieval Configuration" subtitle="Tune how documents are searched and how much context is sent to the LLM." />
      <p style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>Loading…</p>
    </section>
  );

  const contextTokens = Math.round(config.top_k * config.chunk_size / 4);

  return (
    <section>
      <SectionHeader
        title="Retrieval Configuration"
        subtitle="Tune search depth and chunk quality. Changes to top_k and inner_k take effect immediately. Chunk size changes require re-indexing documents."
      />

      {/* Hardware presets */}
      <div style={{ marginBottom: "28px" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--airbnb-muted)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Hardware presets
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", maxWidth: "640px" }}>
          {HARDWARE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              style={{
                padding: "12px 14px", border: "1px solid var(--airbnb-hairline)",
                borderRadius: "var(--radius-sm)", background: "var(--airbnb-canvas)",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                transition: "border-color 0.12s ease, background 0.12s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-ink)"; e.currentTarget.style.background = "var(--airbnb-surface-soft)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-hairline)"; e.currentTarget.style.background = "var(--airbnb-canvas)"; }}
            >
              <p style={{ margin: "0 0 2px", fontSize: "12px", fontWeight: 600, color: "var(--airbnb-ink)" }}>{preset.label}</p>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--airbnb-muted)", lineHeight: 1.4 }}>{preset.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Parameters */}
      <div style={{ display: "grid", gap: "20px", maxWidth: "540px" }}>
        {/* top_k */}
        <Field
          label="top_k — results sent to LLM"
          hint={`~${contextTokens.toLocaleString()} context tokens`}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="range" min={1} max={200} value={config.top_k}
              onChange={(e) => handleChange("top_k", parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number" min={1} max={200} value={config.top_k}
              onChange={(e) => handleChange("top_k", Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
              style={{ ...inputStyle, width: "64px", flexShrink: 0 }}
            />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--airbnb-muted)", lineHeight: 1.5 }}>
            More results = better recall but more tokens consumed. Safe ceiling = (model context window ÷ 375).
          </p>
        </Field>

        {/* inner_k_multiplier */}
        <Field
          label="Inner search multiplier"
          hint={`vector pool = ${config.top_k * config.inner_k_multiplier} candidates`}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="range" min={1} max={50} value={config.inner_k_multiplier}
              onChange={(e) => handleChange("inner_k_multiplier", parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number" min={1} max={50} value={config.inner_k_multiplier}
              onChange={(e) => handleChange("inner_k_multiplier", Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              style={{ ...inputStyle, width: "64px", flexShrink: 0 }}
            />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--airbnb-muted)", lineHeight: 1.5 }}>
            Each sub-query fetches top_k × multiplier candidates before RRF ranking. Raise for very long documents (100+ pages).
          </p>
        </Field>

        {/* multi_query */}
        <Field label="Multi-query retrieval">
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.multi_query}
              onChange={(e) => handleChange("multi_query", e.target.checked)}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "13px", color: "var(--airbnb-body)" }}>
              Enabled — fires parallel searches for each entity when the question references multiple rules/sections
            </span>
          </label>
        </Field>

        <div style={{ height: "1px", background: "var(--airbnb-hairline)" }} />

        {/* chunk_size */}
        <Field label="Chunk size (characters)" hint="⚠ requires re-indexing">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="range" min={200} max={8000} step={100} value={config.chunk_size}
              onChange={(e) => handleChange("chunk_size", parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number" min={200} max={8000} step={100} value={config.chunk_size}
              onChange={(e) => handleChange("chunk_size", Math.max(200, Math.min(8000, parseInt(e.target.value) || 1500)))}
              style={{ ...inputStyle, width: "72px", flexShrink: 0 }}
            />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--airbnb-muted)", lineHeight: 1.5 }}>
            Larger = complete rules/paragraphs stay together. Smaller = more precise page citations.
          </p>
        </Field>

        {/* chunk_overlap */}
        <Field label="Chunk overlap (characters)" hint="⚠ requires re-indexing">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="range" min={0} max={Math.floor(config.chunk_size * 0.49)} step={50} value={config.chunk_overlap}
              onChange={(e) => handleChange("chunk_overlap", parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number" min={0} max={config.chunk_size - 1} step={50} value={config.chunk_overlap}
              onChange={(e) => handleChange("chunk_overlap", Math.max(0, Math.min(config.chunk_size - 1, parseInt(e.target.value) || 0)))}
              style={{ ...inputStyle, width: "72px", flexShrink: 0 }}
            />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--airbnb-muted)", lineHeight: 1.5 }}>
            Overlap ensures rule headers always co-occur with their content in at least one chunk.
          </p>
        </Field>

        {reindexWarning && (
          <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "var(--radius-sm)" }}>
            <p style={{ margin: 0, fontSize: "12px", color: "#92400e", lineHeight: 1.5 }}>
              <strong>Re-indexing required.</strong> You changed chunk_size or chunk_overlap. New uploads will use these values immediately. Existing documents must be re-indexed to benefit — use the re-index option on each document after saving.
            </p>
          </div>
        )}

        {error && <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{error}</p>}
        <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle, width: "fit-content" }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save configuration"}
        </button>
      </div>
    </section>
  );
}


/* ── Users ──────────────────────────────────────────────────── */

function UsersSection({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.admin.listUsers().then(setUsers).finally(() => setLoading(false));
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
    <section style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
        <SectionHeader title="Users" subtitle="Create accounts and set global roles. Assign workspace access in Workspaces & Members." />
        <button onClick={() => setShowModal(true)} style={{ ...primaryBtnStyle, flexShrink: 0, marginTop: "4px" }}>
          + New user
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>Loading…</p>
      ) : (
        <div style={{ border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", overflow: "hidden", maxWidth: "660px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--airbnb-surface-soft)" }}>
                <Th>User</Th>
                <Th>Joined</Th>
                <Th>Global role</Th>
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
                      <select value={u.role} disabled={updating === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        style={{ ...selectStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
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

      {showModal && (
        <NewUserModal
          onClose={() => setShowModal(false)}
          onCreated={(u) => { setUsers((prev) => [...prev, u]); setShowModal(false); }}
        />
      )}
    </section>
  );
}

function NewUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const [form, setForm] = useState({ email: "", display_name: "", password: "", role: "member" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const user = await api.admin.createUser(form);
      onCreated(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, backdropFilter: "blur(2px)" }}
      />
      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 101, background: "var(--airbnb-canvas)",
        border: "1px solid var(--airbnb-hairline)",
        borderRadius: "var(--radius-md)", padding: "28px 32px",
        width: "100%", maxWidth: "420px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--airbnb-ink)" }}>Create new user</h2>
          <button
            onClick={onClose}
            style={{ width: "28px", height: "28px", borderRadius: "50%", border: "none", background: "var(--airbnb-surface-strong)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Field label="Email address">
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} autoFocus />
          </Field>
          <Field label="Display name (optional)">
            <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Temporary password">
            <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} autoComplete="new-password" />
          </Field>
          <Field label="Global role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={selectStyle}>
              <option value="viewer">viewer — chat only</option>
              <option value="member">member — upload + chat</option>
              <option value="admin">admin — full access</option>
            </select>
          </Field>
          {error && <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button type="submit" disabled={creating} style={{ ...primaryBtnStyle, flex: 1 }}>
              {creating ? "Creating…" : "Create user"}
            </button>
            <button type="button" onClick={onClose} style={ghostBtnStyle}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  );
}


/* ── Workspaces & Members ───────────────────────────────────── */

function WorkspacesSection() {
  const { apiWorkspaces, setApiWorkspaces } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [wsForm, setWsForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [expandedWs, setExpandedWs] = useState<string | null>(null);

  async function handleCreateWs(e: React.FormEvent) {
    e.preventDefault();
    if (!wsForm.name.trim()) return;
    setSaving(true);
    setWsError(null);
    try {
      const ws = await api.workspaces.create(wsForm.name.trim(), wsForm.description.trim() || undefined);
      setApiWorkspaces([...apiWorkspaces, ws]);
      setWsForm({ name: "", description: "" });
      setShowCreate(false);
      setExpandedWs(ws.id);
    } catch (e) {
      setWsError(e instanceof ApiError ? e.message : "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
        <SectionHeader title="Workspaces & Members" subtitle="Only admins can create workspaces. Add users and set their per-workspace role." />
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} style={{ ...primaryBtnStyle, flexShrink: 0, marginTop: "4px" }}>+ New workspace</button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleCreateWs} style={{ display: "grid", gap: "12px", maxWidth: "400px", padding: "16px", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", background: "var(--airbnb-surface-soft)", marginBottom: "20px" }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)" }}>Create workspace</p>
          <Field label="Name">
            <input required value={wsForm.name} onChange={(e) => setWsForm({ ...wsForm, name: e.target.value })} placeholder="e.g. Research Papers" style={inputStyle} autoFocus />
          </Field>
          <Field label="Description (optional)">
            <input value={wsForm.description} onChange={(e) => setWsForm({ ...wsForm, description: e.target.value })} style={inputStyle} />
          </Field>
          {wsError && <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{wsError}</p>}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>{saving ? "Creating…" : "Create"}</button>
            <button type="button" onClick={() => setShowCreate(false)} style={ghostBtnStyle}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "640px" }}>
        {apiWorkspaces.map((ws) => (
          <WorkspaceRow
            key={ws.id}
            workspace={ws}
            expanded={expandedWs === ws.id}
            onToggle={() => setExpandedWs(expandedWs === ws.id ? null : ws.id)}
          />
        ))}
      </div>
    </section>
  );
}

function WorkspaceRow({ workspace, expanded, onToggle }: { workspace: ApiWorkspace; expanded: boolean; onToggle: () => void }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "llm">("members");

  const [llmCfg, setLlmCfg] = useState<LLMConfig | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmModels, setLlmModels] = useState<OllamaModel[]>([]);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    Promise.all([api.admin.listMembers(workspace.id), api.admin.listUsers()])
      .then(([mems, users]) => { setMembers(mems); setAllUsers(users); })
      .finally(() => setLoading(false));
  }, [expanded, workspace.id]);

  useEffect(() => {
    if (!expanded || activeTab !== "llm" || llmCfg !== null) return;
    setLlmLoading(true);
    api.admin.getWorkspaceLLMConfig(workspace.id)
      .then(setLlmCfg)
      .catch(() => setLlmCfg({ provider: "ollama", base_url: "", model: "", api_key: "" }))
      .finally(() => setLlmLoading(false));
  }, [expanded, activeTab, workspace.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (llmCfg && LOCAL_PROVIDERS.has(llmCfg.provider) && llmCfg.base_url) {
      api.admin.listOllamaModels().then(setLlmModels).catch(() => {});
    }
  }, [llmCfg?.provider, llmCfg?.base_url]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLlmSave() {
    if (!llmCfg) return;
    setLlmSaving(true);
    setLlmError(null);
    try {
      setLlmCfg(await api.admin.updateWorkspaceLLMConfig(workspace.id, llmCfg));
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 2500);
    } catch (e) {
      setLlmError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setLlmSaving(false);
    }
  }

  async function handleLlmClear() {
    setLlmSaving(true);
    try {
      await api.admin.clearWorkspaceLLMConfig(workspace.id);
      setLlmCfg({ provider: "", base_url: "", model: "", api_key: "" });
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 2500);
    } catch (e) {
      setLlmError(e instanceof ApiError ? e.message : "Clear failed");
    } finally {
      setLlmSaving(false);
    }
  }

  const nonMembers = allUsers.filter((u) => !members.find((m) => m.user_id === u.id));

  async function handleAdd() {
    if (!addUserId) return;
    setAdding(true);
    setAddError(null);
    try {
      const m = await api.admin.addMember(workspace.id, addUserId, addRole);
      setMembers((prev) => [...prev, m]);
      setAddUserId("");
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      const m = await api.admin.updateMemberRole(workspace.id, userId, role);
      setMembers((prev) => prev.map((mb) => mb.user_id === userId ? m : mb));
    } catch {}
  }

  async function handleRemove(userId: string) {
    try {
      await api.admin.removeMember(workspace.id, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch {}
  }

  return (
    <div style={{ border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: expanded ? "var(--airbnb-surface-soft)" : "var(--airbnb-canvas)", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "14px", color: "var(--airbnb-ink)" }}>{workspace.name}</p>
          {workspace.description && <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--airbnb-muted)" }}>{workspace.description}</p>}
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
          <path d="M2 3.5l3 3 3-3" stroke="var(--airbnb-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--airbnb-hairline)", background: "var(--airbnb-canvas)" }}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--airbnb-hairline)", background: "var(--airbnb-surface-soft)" }}>
            {(["members", "llm"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "8px 16px", fontSize: "12px", fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "var(--airbnb-ink)" : "var(--airbnb-muted)",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab ? "2px solid var(--airbnb-ink)" : "2px solid transparent",
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {tab === "members" ? "Members" : "LLM Override"}
              </button>
            ))}
          </div>

          <div style={{ padding: "12px 16px 16px" }}>
            {activeTab === "members" && (
              loading ? (
                <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: 0 }}>Loading…</p>
              ) : (
                <>
                  {members.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--airbnb-hairline)" }}>
                          <Th>Member</Th><Th>Role</Th><Th></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m, i) => (
                          <tr key={m.user_id} style={{ borderTop: i > 0 ? "1px solid var(--airbnb-hairline-soft)" : "none" }}>
                            <td style={{ padding: "8px 0" }}>
                              <p style={{ margin: 0, fontWeight: 500, color: "var(--airbnb-ink)" }}>{m.display_name ?? m.email}</p>
                              {m.display_name && <p style={{ margin: 0, fontSize: "11px", color: "var(--airbnb-muted)" }}>{m.email}</p>}
                            </td>
                            <td style={{ padding: "8px 8px" }}>
                              <select value={m.role} onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                                style={{ ...selectStyle, padding: "3px 6px", fontSize: "12px", width: "auto" }}>
                                <option value="admin">admin</option>
                                <option value="member">member</option>
                                <option value="viewer">viewer</option>
                              </select>
                            </td>
                            <td style={{ padding: "8px 0", textAlign: "right" }}>
                              <button onClick={() => handleRemove(m.user_id)}
                                style={{ ...ghostBtnStyle, height: "28px", padding: "0 10px", fontSize: "12px", color: "#ef4444", borderColor: "#fca5a5" }}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {nonMembers.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
                        style={{ ...selectStyle, flex: 1, minWidth: "160px" }}>
                        <option value="">Select user to add…</option>
                        {nonMembers.map((u) => <option key={u.id} value={u.id}>{u.display_name ?? u.email}</option>)}
                      </select>
                      <select value={addRole} onChange={(e) => setAddRole(e.target.value)}
                        style={{ ...selectStyle, width: "110px" }}>
                        <option value="viewer">viewer</option>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                      <button onClick={handleAdd} disabled={!addUserId || adding} style={primaryBtnStyle}>
                        {adding ? "Adding…" : "Add"}
                      </button>
                    </div>
                  )}
                  {addError && <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "6px", marginBottom: 0 }}>{addError}</p>}
                  {nonMembers.length === 0 && members.length > 0 && (
                    <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: 0 }}>All users are already members.</p>
                  )}
                  {members.length === 0 && nonMembers.length === 0 && (
                    <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: 0 }}>No users yet. Create users in the Users section.</p>
                  )}
                </>
              )
            )}

            {activeTab === "llm" && (
              llmLoading ? (
                <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: 0 }}>Loading…</p>
              ) : llmCfg ? (
                <div style={{ display: "grid", gap: "14px", maxWidth: "420px" }}>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--airbnb-muted)", lineHeight: 1.5 }}>
                    Override the global LLM for this workspace. Leave all fields empty to use the global config.
                  </p>
                  <Field label="Provider">
                    <select value={llmCfg.provider} onChange={(e) => setLlmCfg({ ...llmCfg, provider: e.target.value })} style={selectStyle}>
                      <option value="">— use global —</option>
                      {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                  {llmCfg.provider && (
                    <>
                      <Field label="Base URL">
                        <input value={llmCfg.base_url} onChange={(e) => setLlmCfg({ ...llmCfg, base_url: e.target.value })} style={inputStyle} placeholder="http://host.docker.internal:11434" />
                      </Field>
                      <Field label="Model">
                        {LOCAL_PROVIDERS.has(llmCfg.provider) && llmModels.length > 0
                          ? <select value={llmCfg.model} onChange={(e) => setLlmCfg({ ...llmCfg, model: e.target.value })} style={selectStyle}>
                              {llmModels.map((m) => <option key={m.name} value={m.name}>{m.name}{m.parameter_size ? ` (${m.parameter_size})` : ""}</option>)}
                            </select>
                          : <input value={llmCfg.model} onChange={(e) => setLlmCfg({ ...llmCfg, model: e.target.value })} style={inputStyle} placeholder="llama3.2" />
                        }
                      </Field>
                      {!LOCAL_PROVIDERS.has(llmCfg.provider) && (
                        <Field label="API Key">
                          <input type="password" value={llmCfg.api_key} onChange={(e) => setLlmCfg({ ...llmCfg, api_key: e.target.value })} style={inputStyle} placeholder="sk-…" autoComplete="new-password" />
                        </Field>
                      )}
                    </>
                  )}
                  {llmError && <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>{llmError}</p>}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={handleLlmSave} disabled={llmSaving} style={primaryBtnStyle}>
                      {llmSaving ? "Saving…" : llmSaved ? "✓ Saved" : "Save override"}
                    </button>
                    <button onClick={handleLlmClear} disabled={llmSaving} style={ghostBtnStyle}>Clear override</button>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Shared components ──────────────────────────────────────── */

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--airbnb-ink)", margin: "0 0 4px" }}>{title}</h2>
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

function Th({ children }: { children?: React.ReactNode }) {
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

const inputStyle: React.CSSProperties = {
  width: "100%", height: "38px", padding: "0 12px",
  border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)",
  fontSize: "13px", color: "var(--airbnb-ink)", background: "var(--airbnb-canvas)",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", appearance: "auto" };

const primaryBtnStyle: React.CSSProperties = {
  height: "36px", padding: "0 16px", background: "var(--airbnb-rausch)",
  border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px",
  fontWeight: 500, color: "white", cursor: "pointer", fontFamily: "inherit",
};

const ghostBtnStyle: React.CSSProperties = {
  height: "36px", padding: "0 14px", background: "transparent",
  border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)",
  fontSize: "13px", color: "var(--airbnb-body)", cursor: "pointer", fontFamily: "inherit",
};
