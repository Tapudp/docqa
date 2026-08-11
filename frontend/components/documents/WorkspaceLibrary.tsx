"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { ApiDocument, TagImportResult } from "@/lib/types";

const MAX_VISIBLE = 20;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function FileTypeIcon({ mime }: { mime: string }) {
  const isPdf = mime === "application/pdf";
  const isWord = mime.includes("wordprocessingml");
  const isExcel = mime.includes("spreadsheetml");
  const isPpt = mime.includes("presentationml");
  const isImage = mime.startsWith("image/");

  const [bg, label] = isPdf
    ? ["#fee2e2", "PDF"]
    : isWord
    ? ["#dbeafe", "DOC"]
    : isExcel
    ? ["#dcfce7", "XLS"]
    : isPpt
    ? ["#fef3c7", "PPT"]
    : isImage
    ? ["#f3e8ff", "IMG"]
    : ["#f3f4f6", "FILE"];

  const color = isPdf
    ? "#dc2626"
    : isWord
    ? "#2563eb"
    : isExcel
    ? "#16a34a"
    : isPpt
    ? "#d97706"
    : isImage
    ? "#9333ea"
    : "#6b7280";

  return (
    <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ fontSize: "10px", fontWeight: 700, color, letterSpacing: "0.02em" }}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    ready:    { label: "Indexed",  bg: "#dcfce7", color: "#15803d" },
    indexing: { label: "Indexing", bg: "#fef9c3", color: "#a16207" },
    chunking: { label: "Chunking", bg: "#fef9c3", color: "#a16207" },
    parsing:  { label: "Parsing",  bg: "#fef9c3", color: "#a16207" },
    received: { label: "Queued",   bg: "#f3f4f6", color: "#6b7280" },
    error:    { label: "Error",    bg: "#fee2e2", color: "#dc2626" },
  };
  const { label, bg, color } = config[status] ?? config.received;
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: bg, color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 500,
      padding: "2px 7px",
      borderRadius: "999px",
      background: "var(--airbnb-surface-soft)",
      border: "1px solid var(--airbnb-hairline)",
      color: "var(--airbnb-body)",
      whiteSpace: "nowrap",
    }}>
      {tag}
    </span>
  );
}

function AddTagPopover({ doc, onClose }: { doc: ApiDocument; onClose: () => void }) {
  const { updateApiDocument } = useStore();
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function commitInput() {
    const val = input.trim().toLowerCase().replace(/,/g, "");
    if (val && !tags.includes(val)) setTags((p) => [...p, val]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitInput(); }
    else if (e.key === "Backspace" && !input && tags.length > 0) setTags((p) => p.slice(0, -1));
    else if (e.key === "Escape") onClose();
  }

  async function handleSave() {
    commitInput();
    const finalTags = [...tags];
    const pendingVal = input.trim().toLowerCase().replace(/,/g, "");
    if (pendingVal && !finalTags.includes(pendingVal)) finalTags.push(pendingVal);
    if (finalTags.length === 0) { onClose(); return; }
    setSaving(true);
    try {
      const updated = await api.documents.setTags(doc.id, finalTags);
      updateApiDocument(updated);
      onClose();
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: "52px",
        zIndex: 50,
        background: "var(--airbnb-canvas)",
        border: "1px solid var(--airbnb-hairline)",
        borderRadius: "10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        padding: "14px",
        width: "300px",
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600, color: "var(--airbnb-ink)" }}>
        Add tags
      </p>

      {/* Chip input */}
      <div
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px", minHeight: "36px", padding: "5px 8px", border: "1px solid var(--airbnb-hairline)", borderRadius: "7px", background: "var(--airbnb-surface-soft)", cursor: "text" }}
        onClick={() => (document.getElementById(`tag-input-${doc.id}`) as HTMLInputElement)?.focus()}
      >
        {tags.map((tag) => (
          <span key={tag} style={{ display: "flex", alignItems: "center", gap: "3px", padding: "1px 7px", borderRadius: "999px", background: "var(--airbnb-canvas)", border: "1px solid var(--airbnb-hairline)", fontSize: "11px", fontWeight: 500, color: "var(--airbnb-ink)" }}>
            {tag}
            <button onClick={() => setTags((p) => p.filter((t) => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--airbnb-muted)", fontSize: "12px" }}>×</button>
          </span>
        ))}
        <input
          id={`tag-input-${doc.id}`}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitInput}
          placeholder={tags.length === 0 ? "Type a tag…" : ""}
          style={{ flex: 1, minWidth: "80px", border: "none", outline: "none", fontSize: "12px", color: "var(--airbnb-ink)", background: "transparent", fontFamily: "inherit", padding: "1px 0" }}
        />
      </div>
      <p style={{ margin: "5px 0 10px", fontSize: "11px", color: "var(--airbnb-muted)" }}>
        Press Enter or comma after each tag.
      </p>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ height: "30px", padding: "0 12px", background: "transparent", border: "1px solid var(--airbnb-hairline)", borderRadius: "6px", fontSize: "12px", color: "var(--airbnb-body)", cursor: "pointer", fontFamily: "inherit" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || (tags.length === 0 && !input.trim())}
          style={{ height: "30px", padding: "0 14px", background: "var(--airbnb-rausch)", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, color: "white", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function FileRow({ doc, isSelected, onClick }: {
  doc: ApiDocument;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          padding: "12px 16px",
          borderRadius: "10px",
          cursor: "pointer",
          background: isSelected ? "var(--airbnb-surface-soft)" : hovered ? "var(--airbnb-surface-soft)" : "transparent",
          border: isSelected ? "1px solid var(--airbnb-hairline)" : "1px solid transparent",
          transition: "background 0.1s ease, border-color 0.1s ease",
        }}
      >
        <div style={{ paddingTop: "2px" }}>
          <FileTypeIcon mime={doc.mime_type} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.filename}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--airbnb-muted)" }}>
            {formatSize(doc.file_size)} · {formatDate(doc.created_at)}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px", alignItems: "center" }}>
            {doc.tags.map((tag) => <TagChip key={tag} tag={tag} />)}
            {doc.tags.length === 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setTagPopoverOpen(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "2px 9px", borderRadius: "999px",
                  border: "1px dashed var(--airbnb-hairline)",
                  background: "transparent", cursor: "pointer",
                  fontSize: "11px", fontWeight: 500, color: "var(--airbnb-muted)",
                  fontFamily: "inherit",
                  transition: "border-color 0.1s ease, color 0.1s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-ink)"; e.currentTarget.style.color = "var(--airbnb-ink)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-hairline)"; e.currentTarget.style.color = "var(--airbnb-muted)"; }}
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Add tag
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "2px", flexShrink: 0 }}>
          <StatusBadge status={doc.status} />
          {isSelected && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l5 4-5 4" stroke="var(--airbnb-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {tagPopoverOpen && (
        <AddTagPopover doc={doc} onClose={() => setTagPopoverOpen(false)} />
      )}
    </div>
  );
}

// ── Tag import modal ──────────────────────────────────────────

function TagImportModal({ workspaceId, onClose, onDone }: {
  workspaceId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TagImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.bulkImportTags(workspaceId, file);
      setResults(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  const updated = results?.filter((r) => r.status === "updated").length ?? 0;
  const notFound = results?.filter((r) => r.status === "not_found").length ?? 0;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 201, background: "var(--airbnb-canvas)", borderRadius: "14px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: "28px", width: "480px",
        maxWidth: "calc(100vw - 32px)", maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "var(--airbnb-ink)" }}>
          Import tags from Excel
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--airbnb-muted)", lineHeight: 1.55 }}>
          Upload an <strong>.xlsx</strong> file. Row 1 is a header (skipped). Column A is the filename; columns B onwards are tags — one tag per cell. Existing tags are replaced.
        </p>

        {/* Warning note */}
        <div style={{ display: "flex", gap: "10px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M8 1.5L1 14h14L8 1.5z" stroke="#d97706" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
            <path d="M8 6v4" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.75" fill="#d97706" />
          </svg>
          <p style={{ margin: 0, fontSize: "12px", color: "#92400e", lineHeight: 1.6 }}>
            The filename in column A must <strong>exactly match</strong> a file already uploaded to this workspace (case-insensitive). If the filename doesn&apos;t exist in the system, that row is skipped and no tags are applied. Typing a random or incorrect filename will have no effect.
          </p>
        </div>

        <div style={{ background: "var(--airbnb-surface-soft)", border: "1px dashed var(--airbnb-hairline)", borderRadius: "10px", padding: "16px 20px", marginBottom: "16px" }}>
          <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Example format
          </p>
          <table style={{ fontSize: "12px", color: "var(--airbnb-body)", borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ color: "var(--airbnb-muted)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px 4px 0", fontWeight: 600 }}>filename</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>tag 1</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>tag 2</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>tag 3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "3px 8px 3px 0" }}>budget-2024.pdf</td>
                <td style={{ padding: "3px 8px" }}>finance</td>
                <td style={{ padding: "3px 8px" }}>2024</td>
                <td style={{ padding: "3px 8px" }}>Q1</td>
              </tr>
              <tr>
                <td style={{ padding: "3px 8px 3px 0" }}>hr-policy.docx</td>
                <td style={{ padding: "3px 8px" }}>hr</td>
                <td style={{ padding: "3px 8px" }}>policy</td>
                <td style={{ padding: "3px 8px" }}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <input ref={fileRef} type="file" accept=".xlsx" style={{ marginBottom: "16px", fontSize: "13px", color: "var(--airbnb-ink)" }} />

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#dc2626", background: "#fee2e2", padding: "10px 14px", borderRadius: "8px" }}>
            {error}
          </p>
        )}

        {results && (
          <div style={{ flex: 1, overflowY: "auto", marginBottom: "16px" }}>
            <p style={{ margin: "0 0 10px", fontSize: "13px", color: "var(--airbnb-body)" }}>
              {updated} updated · {notFound} not found
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", padding: "6px 10px", borderRadius: "6px", background: r.status === "updated" ? "#f0fdf4" : r.status === "not_found" ? "#fef9c3" : "#fee2e2" }}>
                  <span style={{ fontWeight: 600, color: r.status === "updated" ? "#15803d" : r.status === "not_found" ? "#a16207" : "#dc2626" }}>
                    {r.status === "updated" ? "✓" : r.status === "not_found" ? "?" : "✗"}
                  </span>
                  <span style={{ color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.filename}</span>
                  {r.tags.length > 0 && <span style={{ color: "var(--airbnb-muted)", flexShrink: 0 }}>{r.tags.join(", ")}</span>}
                  {r.reason && <span style={{ color: "var(--airbnb-muted)", flexShrink: 0 }}>{r.reason}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={results ? onDone : onClose} style={{ height: "36px", padding: "0 16px", background: "transparent", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--airbnb-body)", cursor: "pointer", fontFamily: "inherit" }}>
            {results ? "Done" : "Cancel"}
          </button>
          {!results && (
            <button
              onClick={handleUpload}
              disabled={loading}
              style={{ height: "36px", padding: "0 16px", background: "var(--airbnb-rausch)", border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, color: "white", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Importing…" : "Import tags"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────

export default function WorkspaceLibrary() {
  const { apiDocuments, apiWorkspaces, activeWorkspaceId, openPdf, pdfDocId, currentUser, updateApiDocument } = useStore();
  const [query, setQuery] = useState("");
  const [tagImportOpen, setTagImportOpen] = useState(false);

  const activeWorkspace = apiWorkspaces.find((w) => w.id === activeWorkspaceId);
  const isAdmin = currentUser?.role === "admin";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apiDocuments.slice(0, MAX_VISIBLE);
    return apiDocuments
      .filter((d) =>
        d.filename.toLowerCase().includes(q) ||
        d.tags.some((t) => t.includes(q))
      )
      .slice(0, MAX_VISIBLE);
  }, [apiDocuments, query]);

  const totalCount = apiDocuments.length;
  const indexedCount = apiDocuments.filter((d) => d.status === "ready").length;

  async function handleTagImportDone() {
    // Reload document list so tag changes appear without a full page refresh
    if (!activeWorkspaceId) return;
    try {
      const docs = await api.documents.list(activeWorkspaceId);
      docs.forEach((d) => updateApiDocument(d));
    } catch { /* silent */ }
    setTagImportOpen(false);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--airbnb-canvas)" }}>

      {/* Header */}
      <div style={{ padding: "40px 48px 28px", borderBottom: "1px solid var(--airbnb-hairline)", background: "var(--airbnb-canvas)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {activeWorkspace?.name ?? "Workspace"}
            </p>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "var(--airbnb-ink)", letterSpacing: "-0.3px" }}>
              Files
            </h1>
          </div>

          {isAdmin && (
            <button
              onClick={() => setTagImportOpen(true)}
              style={{
                height: "34px", padding: "0 14px", background: "transparent",
                border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)",
                fontSize: "12px", fontWeight: 600, color: "var(--airbnb-body)",
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px",
                transition: "border-color 0.12s ease, background 0.12s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--airbnb-surface-soft)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Import tags
            </button>
          )}
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", maxWidth: "560px" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="7" cy="7" r="5" stroke="var(--airbnb-muted)" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="var(--airbnb-muted)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename or tag…"
            style={{
              width: "100%", height: "44px", paddingLeft: "40px", paddingRight: "16px",
              fontSize: "14px", color: "var(--airbnb-ink)", background: "var(--airbnb-surface-soft)",
              border: "1px solid var(--airbnb-hairline)", borderRadius: "10px", outline: "none",
              fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-ink)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,34,34,0.06)"; e.currentTarget.style.background = "var(--airbnb-canvas)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--airbnb-hairline)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "var(--airbnb-surface-soft)"; }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--airbnb-muted)", display: "flex", alignItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--airbnb-muted)" }}>
          {query
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${query}"`
            : `${totalCount} file${totalCount !== 1 ? "s" : ""} · ${indexedCount} indexed`}
        </p>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 40px 32px" }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", padding: "80px 0", color: "var(--airbnb-muted)" }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="17" cy="17" r="11" stroke="var(--airbnb-hairline)" strokeWidth="2" />
              <path d="M23 23l6 6" stroke="var(--airbnb-hairline)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 500 }}>
              {query ? `No files matching "${query}"` : "No files uploaded yet"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxWidth: "720px" }}>
            {filtered.map((doc) => (
              <FileRow
                key={doc.id}
                doc={doc}
                isSelected={pdfDocId === doc.id}
                onClick={() => openPdf(doc.id, 1)}
              />
            ))}
            {!query && totalCount > MAX_VISIBLE && (
              <p style={{ margin: "12px 0 0 16px", fontSize: "12px", color: "var(--airbnb-muted)" }}>
                Showing {MAX_VISIBLE} of {totalCount} files. Use search to find others.
              </p>
            )}
          </div>
        )}
      </div>

      {tagImportOpen && activeWorkspaceId && (
        <TagImportModal
          workspaceId={activeWorkspaceId}
          onClose={() => setTagImportOpen(false)}
          onDone={handleTagImportDone}
        />
      )}
    </div>
  );
}
