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

// ── File type icon ────────────────────────────────────────────

function FileTypeIcon({ mime, size = 38 }: { mime: string; size?: number }) {
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
    <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: "8px", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ fontSize: size > 40 ? "12px" : "10px", fontWeight: 700, color, letterSpacing: "0.02em" }}>{label}</span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────

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

// ── Tag chip — purple/violet ───────────────────────────────────

function TagChip({ tag }: { tag: string }) {
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 500,
      padding: "2px 7px",
      borderRadius: "999px",
      background: "#ede9fe",
      border: "1px solid #c4b5fd",
      color: "#6d28d9",
      whiteSpace: "nowrap",
    }}>
      {tag}
    </span>
  );
}

// ── Add tag popover ───────────────────────────────────────────

function AddTagPopover({ doc, onClose }: { doc: ApiDocument; onClose: () => void }) {
  const { updateApiDocument, apiDocuments } = useStore();
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // All unique tags across the workspace, excluding ones on this doc and already selected
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    apiDocuments.forEach((d) => d.tags.forEach((t) => seen.add(t)));
    doc.tags.forEach((t) => seen.delete(t));
    return Array.from(seen).filter((t) => !tags.includes(t)).slice(0, 15);
  }, [apiDocuments, doc.tags, tags]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = input.trim().toLowerCase().replace(/,/g, "");
      if (val && !tags.includes(val)) setTags((p) => [...p, val]);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      setTags((p) => p.slice(0, -1));
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  async function handleSave() {
    const pendingVal = input.trim().toLowerCase().replace(/,/g, "");
    const newTags = Array.from(new Set(tags.concat(pendingVal ? [pendingVal] : [])));
    if (newTags.length === 0) { onClose(); return; }
    const combined = Array.from(new Set(doc.tags.concat(newTags)));
    setSaving(true);
    try {
      const updated = await api.documents.setTags(doc.id, combined);
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
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px", minHeight: "36px", padding: "5px 8px", border: "1px solid #c4b5fd", borderRadius: "7px", background: "#faf5ff", cursor: "text" }}
        onClick={() => (document.getElementById(`tag-input-${doc.id}`) as HTMLInputElement)?.focus()}
      >
        {tags.map((tag) => (
          <span key={tag} style={{ display: "flex", alignItems: "center", gap: "3px", padding: "1px 7px", borderRadius: "999px", background: "#ede9fe", border: "1px solid #c4b5fd", fontSize: "11px", fontWeight: 500, color: "#6d28d9" }}>
            {tag}
            <button onClick={() => setTags((p) => p.filter((t) => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#9d75e8", fontSize: "12px" }}>×</button>
          </span>
        ))}
        <input
          id={`tag-input-${doc.id}`}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            const val = input.trim().toLowerCase().replace(/,/g, "");
            if (val && !tags.includes(val)) setTags((p) => [...p, val]);
            setInput("");
          }}
          placeholder={tags.length === 0 ? "Type a tag…" : ""}
          style={{ flex: 1, minWidth: "80px", border: "none", outline: "none", fontSize: "12px", color: "var(--airbnb-ink)", background: "transparent", fontFamily: "inherit", padding: "1px 0" }}
        />
      </div>

      {/* Existing workspace tag suggestions */}
      {suggestions.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Existing tags in workspace
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {suggestions.map((t) => (
              <button
                key={t}
                onClick={() => setTags((p) => p.includes(t) ? p : [...p, t])}
                style={{
                  padding: "2px 8px", borderRadius: "999px",
                  background: "transparent", border: "1px solid #c4b5fd",
                  fontSize: "11px", fontWeight: 500, color: "#7c3aed",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#ede9fe"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <p style={{ margin: "8px 0 10px", fontSize: "11px", color: "var(--airbnb-muted)" }}>
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
          style={{ height: "30px", padding: "0 14px", background: "#7c3aed", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, color: "white", cursor: saving || (tags.length === 0 && !input.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving || (tags.length === 0 && !input.trim()) ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── File view modal ───────────────────────────────────────────

function FileViewModal({ doc, onClose }: { doc: ApiDocument; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isPdf = doc.mime_type === "application/pdf";
  const isImage = doc.mime_type.startsWith("image/");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("docqa_token") : null;
    let url: string | null = null;

    fetch(`/api/documents/${doc.id}/file`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.blob();
      })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });

    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc.id]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleDownload() {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = doc.filename;
    a.click();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.92)" }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", background: "rgba(0,0,0,0.55)", flexShrink: 0 }}>
        <FileTypeIcon mime={doc.mime_type} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.filename}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
            {formatSize(doc.file_size)} · {formatDate(doc.created_at)}
            {doc.tags.length > 0 && ` · ${doc.tags.join(", ")}`}
          </p>
        </div>
        {/* Download intentionally omitted from header — printing/downloading is disabled in this viewer */}
        <button
          onClick={onClose}
          style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.1s ease" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1l11 11M12 1L1 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Content — click backdrop to close */}
      <div
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        onClick={onClose}
      >
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", color: "rgba(255,255,255,0.6)" }}>
            <div style={{ width: "32px", height: "32px", border: "3px solid rgba(255,255,255,0.15)", borderTopColor: "white", borderRadius: "50%", animation: "modal-spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "14px" }}>Loading file…</p>
          </div>
        )}

        {!loading && error && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--airbnb-canvas)", borderRadius: "14px", padding: "40px 48px", textAlign: "center" }}
          >
            <p style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 600, color: "var(--airbnb-ink)" }}>Could not load file</p>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--airbnb-muted)" }}>The file may still be processing or an error occurred.</p>
          </div>
        )}

        {!loading && !error && blobUrl && isPdf && (
          <iframe
            src={blobUrl + "#toolbar=0&navpanes=0&view=FitH"}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          />
        )}

        {!loading && !error && blobUrl && isImage && (
          <img
            src={blobUrl}
            alt={doc.filename}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "calc(100% - 48px)", maxHeight: "calc(100% - 24px)", objectFit: "contain", borderRadius: "8px", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          />
        )}

        {!loading && !error && !isPdf && !isImage && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--airbnb-canvas)", borderRadius: "14px", padding: "40px 48px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", maxWidth: "380px" }}
          >
            <FileTypeIcon mime={doc.mime_type} size={52} />
            <p style={{ margin: "16px 0 4px", fontSize: "16px", fontWeight: 600, color: "var(--airbnb-ink)" }}>{doc.filename}</p>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "var(--airbnb-muted)" }}>
              {formatSize(doc.file_size)} · In-browser preview not available
            </p>
            {blobUrl && (
              <button
                onClick={handleDownload}
                style={{ height: "38px", padding: "0 20px", background: "#7c3aed", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, color: "white", cursor: "pointer", fontFamily: "inherit" }}
              >
                Download file
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes modal-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── File row ──────────────────────────────────────────────────

function FileRow({ doc, isSelected, onClick, onDelete }: {
  doc: ApiDocument;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
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
          background: isSelected ? "#f5f3ff" : hovered ? "var(--airbnb-surface-soft)" : "transparent",
          border: isSelected ? "1px solid #c4b5fd" : "1px solid transparent",
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
                  border: "1px dashed #c4b5fd",
                  background: "transparent", cursor: "pointer",
                  fontSize: "11px", fontWeight: 500, color: "#9d75e8",
                  fontFamily: "inherit",
                  transition: "border-color 0.1s ease, color 0.1s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.color = "#7c3aed"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#c4b5fd"; e.currentTarget.style.color = "#9d75e8"; }}
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Add tag
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingTop: "2px", flexShrink: 0 }}>
          <StatusBadge status={doc.status} />

          {/* Trash icon — opens confirmation modal in parent */}
          {hovered && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete file"
              style={{ width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.1s ease, border-color 0.1s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.borderColor = "#fca5a5"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 3.5h9M4.5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.5 3.5l.5 7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1l.5-7" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M5 6v3.5M8 6v3.5" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
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

  function downloadSample() {
    const csv = [
      "filename,tag1,tag2,tag3",
      "budget-2024.pdf,finance,2024,Q1",
      "hr-policy.docx,hr,policy,",
      "project-plan.pptx,projects,planning,",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tag-import-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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

        {/* Warning callout */}
        <div style={{ display: "flex", gap: "10px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M8 1.5L1 14h14L8 1.5z" stroke="#d97706" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
            <path d="M8 6v4" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.75" fill="#d97706" />
          </svg>
          <p style={{ margin: 0, fontSize: "12px", color: "#92400e", lineHeight: 1.6 }}>
            The filename in column A must <strong>exactly match</strong> a file already uploaded to this workspace (case-insensitive). If the filename doesn&apos;t exist, that row is skipped.
          </p>
        </div>

        {/* Example table */}
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

        {/* File input + sample download */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ flex: 1, fontSize: "13px", color: "var(--airbnb-ink)" }} />
          <button
            onClick={downloadSample}
            style={{ height: "32px", padding: "0 12px", background: "transparent", border: "1px solid #c4b5fd", borderRadius: "7px", fontSize: "12px", color: "#7c3aed", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "background 0.1s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ede9fe"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3.5 5.5l2.5 3 2.5-3M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sample CSV
          </button>
        </div>

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
              style={{ height: "36px", padding: "0 16px", background: "#7c3aed", border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, color: "white", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Importing…" : "Import tags"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Delete confirm modal ──────────────────────────────────────

function DeleteConfirmModal({ doc, onClose, onConfirm }: {
  doc: ApiDocument;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.40)", zIndex: 400, backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 401, background: "var(--airbnb-canvas)", borderRadius: "14px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.20)", padding: "28px 28px 24px",
        width: "380px", maxWidth: "calc(100vw - 32px)",
      }}>
        {/* Red trash icon */}
        <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5.5h14M7.5 5.5V4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v1.5M16 5.5l-1.2 11.1a1 1 0 0 1-1 .9H6.2a1 1 0 0 1-1-.9L4 5.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 9v5M12 9v5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--airbnb-ink)", margin: "0 0 8px" }}>
          Delete this file?
        </p>
        <p style={{ fontSize: "13px", color: "var(--airbnb-body)", margin: "0 0 6px", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--airbnb-ink)" }}>{doc.filename}</strong>
        </p>
        <p style={{ fontSize: "13px", color: "var(--airbnb-muted)", margin: "0 0 24px", lineHeight: 1.55 }}>
          The file and all its indexed content will be permanently deleted. This action cannot be undone.
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{ height: "38px", padding: "0 18px", background: "transparent", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--airbnb-body)", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = "var(--airbnb-surface-soft)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            style={{ height: "38px", padding: "0 18px", background: deleting ? "#fca5a5" : "#ef4444", border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, color: "white", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.12s ease, transform 0.1s ease", minWidth: "120px" }}
            onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = "#dc2626"; }}
            onMouseLeave={(e) => { if (!deleting) e.currentTarget.style.background = "#ef4444"; }}
            onMouseDown={(e) => { if (!deleting) e.currentTarget.style.transform = "scale(0.97)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {deleting ? "Deleting…" : "Yes, delete file"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────

export default function WorkspaceLibrary() {
  const { apiDocuments, apiWorkspaces, activeWorkspaceId, currentUser, updateApiDocument, removeApiDocument } = useStore();
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagImportOpen, setTagImportOpen] = useState(false);
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<ApiDocument | null>(null);

  const activeWorkspace = apiWorkspaces.find((w) => w.id === activeWorkspaceId);
  const isAdmin = currentUser?.role === "admin";

  // Top 10 tags by number of documents that carry them
  const topTags = useMemo(() => {
    const counts: Record<string, number> = {};
    apiDocuments.forEach((d) => d.tags.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; }));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((entry) => entry[0]);
  }, [apiDocuments]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apiDocuments
      .filter((d) => {
        const matchesQuery = !q || d.filename.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q));
        const matchesTags = selectedTags.length === 0 || selectedTags.some((t) => d.tags.includes(t));
        return matchesQuery && matchesTags;
      })
      .slice(0, MAX_VISIBLE);
  }, [apiDocuments, query, selectedTags]);

  const totalCount = apiDocuments.length;
  const indexedCount = apiDocuments.filter((d) => d.status === "ready").length;

  async function handleDeleteConfirm() {
    if (!docToDelete) return;
    try {
      await api.documents.delete(docToDelete.id);
      removeApiDocument(docToDelete.id);
      if (viewDocId === docToDelete.id) setViewDocId(null);
    } catch { /* silent */ } finally {
      setDocToDelete(null);
    }
  }

  async function handleTagImportDone() {
    if (!activeWorkspaceId) return;
    try {
      const docs = await api.documents.list(activeWorkspaceId);
      docs.forEach((d) => updateApiDocument(d));
    } catch { /* silent */ }
    setTagImportOpen(false);
  }

  const viewDoc = viewDocId ? apiDocuments.find((d) => d.id === viewDocId) ?? null : null;

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

        {/* Tag filter strip */}
        {topTags.length > 0 && (
          <div style={{ marginTop: "12px", maxWidth: "560px" }}>
            <div
              className="tag-strip"
              style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px", scrollbarWidth: "none" }}
            >
              <style>{`.tag-strip::-webkit-scrollbar { display: none; }`}</style>
              {topTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      flexShrink: 0, height: "28px", padding: "0 12px",
                      borderRadius: "999px", border: "1px solid",
                      borderColor: active ? "#7c3aed" : "#c4b5fd",
                      background: active ? "#7c3aed" : "transparent",
                      color: active ? "white" : "#7c3aed",
                      fontSize: "12px", fontWeight: active ? 600 : 400,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.1s ease, border-color 0.1s ease, color 0.1s ease",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  style={{
                    flexShrink: 0, height: "28px", padding: "0 10px",
                    borderRadius: "999px", border: "1px solid #fca5a5",
                    background: "transparent", color: "#dc2626",
                    fontSize: "12px", fontWeight: 500, cursor: "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", gap: "4px",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fee2e2"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--airbnb-muted)" }}>
          {(query || selectedTags.length > 0)
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}${selectedTags.length > 0 ? ` tagged ${selectedTags.map((t) => `"${t}"`).join(" or ")}` : ""}${query ? ` matching "${query}"` : ""}`
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
              {query || selectedTags.length > 0 ? "No files match your search or filters" : "No files uploaded yet"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxWidth: "720px" }}>
            {filtered.map((doc) => (
              <FileRow
                key={doc.id}
                doc={doc}
                isSelected={viewDocId === doc.id}
                onClick={() => setViewDocId((prev) => prev === doc.id ? null : doc.id)}
                onDelete={() => setDocToDelete(doc)}
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

      {viewDoc && (
        <FileViewModal doc={viewDoc} onClose={() => setViewDocId(null)} />
      )}

      {docToDelete && (
        <DeleteConfirmModal
          doc={docToDelete}
          onClose={() => setDocToDelete(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
