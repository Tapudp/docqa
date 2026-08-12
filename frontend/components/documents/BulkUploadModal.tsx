"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api";
import type { ApiWorkspace, BulkFileResult } from "@/lib/types";

type FileStatus = "staged" | "uploading" | "done" | "error";

interface StagedFile {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  isDuplicate: boolean;
  zipResults?: BulkFileResult[];
}

const ACCEPTED = [".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".tiff", ".zip"];
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB per file

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function BulkUploadModal() {
  const { setBulkUploadOpen } = useStore();

  const [allWorkspaces, setAllWorkspaces] = useState<ApiWorkspace[]>([]);
  const [wsId, setWsId] = useState<string>("");
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().toLowerCase().replace(/,/g, "");
      if (val && !tags.includes(val)) setTags((prev) => [...prev, val]);
      setTagInput("");
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  useEffect(() => {
    api.admin.listAllWorkspaces().then((ws) => {
      setAllWorkspaces(ws);
      if (ws.length > 0) setWsId(ws[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!wsId) { setExistingNames(new Set()); return; }
    api.documents.list(wsId)
      .then((docs) => setExistingNames(new Set(docs.map((d) => d.filename))))
      .catch(() => {});
  }, [wsId]);

  // Re-check duplicates when workspace or staged files change
  useEffect(() => {
    setStaged((prev) =>
      prev.map((sf) => ({ ...sf, isDuplicate: existingNames.has(sf.file.name) }))
    );
  }, [existingNames]);

  const addFiles = useCallback((files: File[]) => {
    const newItems: StagedFile[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      status: "staged",
      isDuplicate: existingNames.has(f.name),
    }));
    setStaged((prev) => [...prev, ...newItems]);
  }, [existingNames]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const removeFile = (id: string) => {
    setStaged((prev) => prev.filter((sf) => sf.id !== id));
  };

  async function handleUpload() {
    if (!wsId || staged.length === 0 || uploading) return;
    setUploading(true);

    for (let i = 0; i < staged.length; i++) {
      const sf = staged[i];
      if (sf.status === "done") continue;

      setStaged((prev) => prev.map((s) => s.id === sf.id ? { ...s, status: "uploading" } : s));

      const isZip = sf.file.name.toLowerCase().endsWith(".zip");

      if (sf.file.size > MAX_BYTES && !isZip) {
        setStaged((prev) => prev.map((s) => s.id === sf.id
          ? { ...s, status: "error", error: "Exceeds 200 MB limit" } : s));
        continue;
      }

      try {
        if (isZip) {
          const results = await api.admin.uploadZip(wsId, sf.file);
          // Apply tags to every successfully queued file in the zip
          if (tags.length > 0) {
            for (const r of results) {
              if (r.status === "queued" && r.document_id) {
                try { await api.documents.setTags(r.document_id, tags); } catch { /* non-fatal */ }
              }
            }
          }
          setStaged((prev) => prev.map((s) => s.id === sf.id
            ? { ...s, status: "done", zipResults: results } : s));
        } else {
          const doc = await api.admin.uploadDocument(wsId, sf.file);
          if (tags.length > 0) {
            try { await api.documents.setTags(doc.id, tags); } catch { /* non-fatal */ }
          }
          setStaged((prev) => prev.map((s) => s.id === sf.id ? { ...s, status: "done" } : s));
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Upload failed";

        setStaged((prev) => prev.map((s) => s.id === sf.id
          ? { ...s, status: "error", error: msg } : s));
      }
    }

    setUploading(false);
    setDone(true);
  }

  const activeWs = allWorkspaces.find((w) => w.id === wsId);
  const pendingCount = staged.filter((s) => s.status === "staged").length;
  const doneCount = staged.filter((s) => s.status === "done").length;
  const errorCount = staged.filter((s) => s.status === "error").length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.48)" }}
        onClick={() => { if (!uploading) setBulkUploadOpen(false); }}
      />

      {/* Modal */}
      <div
        style={{
          position: "relative", zIndex: 201,
          width: "100%", maxWidth: "620px",
          background: "var(--airbnb-canvas)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column",
          maxHeight: "calc(100vh - 48px)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--airbnb-hairline)", flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--airbnb-ink)", margin: 0 }}>Bulk Upload</h2>
            <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: "3px 0 0" }}>Admin · Upload to any workspace · ZIP archives supported</p>
          </div>
          <button
            onClick={() => { if (!uploading) setBulkUploadOpen(false); }}
            style={{ width: "32px", height: "32px", borderRadius: "var(--radius-full)", background: "var(--airbnb-surface-strong)", border: "none", cursor: uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="#222" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Workspace picker */}
        <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: "6px" }}>
            Target workspace
          </label>
          <select
            value={wsId}
            onChange={(e) => setWsId(e.target.value)}
            disabled={uploading}
            style={{
              width: "100%", height: "40px", padding: "0 12px",
              border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)",
              fontSize: "13px", fontWeight: 500, color: "var(--airbnb-ink)",
              background: "var(--airbnb-canvas)", cursor: uploading ? "not-allowed" : "pointer",
              fontFamily: "inherit", appearance: "auto",
            }}
          >
            {allWorkspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}{ws.description ? ` — ${ws.description}` : ""}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
          <div
            onDragEnter={handleDrag} onDragOver={handleDrag}
            onDragLeave={handleDrag} onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? "var(--airbnb-rausch)" : "var(--airbnb-hairline)"}`,
              borderRadius: "var(--radius-sm)",
              background: dragging ? "#fff5f7" : "var(--airbnb-surface-soft)",
              padding: "22px 24px",
              textAlign: "center",
              transition: "border-color 0.15s ease, background-color 0.15s ease",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 500, color: dragging ? "var(--airbnb-rausch)" : "var(--airbnb-ink)", margin: "0 0 4px" }}>
              {dragging ? "Drop to add files" : "Drag & drop files here"}
            </p>
            <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: "0 0 12px" }}>
              PDF, DOCX, XLSX, PPTX, PNG, JPG, TIFF, ZIP · Max 200 MB per file
            </p>
            <label style={{ display: "inline-block", padding: "8px 18px", background: "var(--airbnb-canvas)", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 500, color: "var(--airbnb-ink)", cursor: "pointer" }}>
              Browse files
              <input type="file" multiple accept={ACCEPTED.join(",")} onChange={handleFileInput} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        {/* Tag input */}
        <div style={{ padding: "14px 24px 0", flexShrink: 0 }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: "6px" }}>
            Do you want to add tags to these files? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </label>
          <div
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px",
              minHeight: "40px", padding: "6px 10px",
              border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)",
              background: "var(--airbnb-canvas)", cursor: "text",
            }}
            onClick={() => (document.getElementById("bulk-tag-input") as HTMLInputElement)?.focus()}
          >
            {tags.map((tag) => (
              <span key={tag} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "999px", background: "var(--airbnb-surface-soft)", border: "1px solid var(--airbnb-hairline)", fontSize: "12px", fontWeight: 500, color: "var(--airbnb-ink)" }}>
                {tag}
                <button onClick={() => setTags((p) => p.filter((t) => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--airbnb-muted)", fontSize: "13px" }}>×</button>
              </span>
            ))}
            <input
              id="bulk-tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                const val = tagInput.trim().toLowerCase().replace(/,/g, "");
                if (val && !tags.includes(val)) setTags((p) => [...p, val]);
                setTagInput("");
              }}
              placeholder={tags.length === 0 ? "Type a tag and press Enter or comma…" : ""}
              disabled={uploading}
              style={{ flex: 1, minWidth: "160px", border: "none", outline: "none", fontSize: "13px", color: "var(--airbnb-ink)", background: "transparent", fontFamily: "inherit", padding: "2px 0" }}
            />
          </div>
          <p style={{ margin: "5px 0 0", fontSize: "11px", color: "var(--airbnb-muted)" }}>
            Tags apply to all files in this upload. Press Enter or comma to add each tag.
          </p>
        </div>

        {/* File list */}
        {staged.length > 0 && (
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 0" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {staged.map((sf) => {
                const isZip = sf.file.name.toLowerCase().endsWith(".zip");
                return (
                  <div key={sf.id}>
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "9px 12px",
                        background: sf.status === "error" ? "#fff5f5" : sf.status === "done" ? "#f0fdf4" : "var(--airbnb-surface-soft)",
                        border: `1px solid ${sf.status === "error" ? "#fca5a5" : sf.status === "done" ? "#86efac" : "var(--airbnb-hairline)"}`,
                        borderRadius: "var(--radius-sm)",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      {/* File icon */}
                      <div style={{ flexShrink: 0, opacity: 0.6 }}>
                        {isZip ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="14" height="14" rx="2" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
                            <path d="M6 1v14M6 4h4M6 7h4M6 10h4" stroke="#6a6a6a" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 2a1 1 0 0 1 1-1h5.5L13 5.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
                            <path d="M8.5 1v4.5H13" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
                          </svg>
                        )}
                      </div>

                      {/* Name + size */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sf.file.name}
                          {sf.isDuplicate && sf.status === "staged" && (
                            <span title="File with this name already exists in this workspace" style={{ marginLeft: "6px", fontSize: "10px", fontWeight: 600, color: "#b45309", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "3px", padding: "1px 5px" }}>
                              duplicate
                            </span>
                          )}
                        </p>
                        {sf.status === "error" && (
                          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#ef4444" }}>{sf.error}</p>
                        )}
                        {sf.status !== "error" && (
                          <p style={{ margin: "1px 0 0", fontSize: "11px", color: "var(--airbnb-muted)" }}>{fileSize(sf.file.size)}</p>
                        )}
                      </div>

                      {/* Status badge */}
                      <StatusBadge status={sf.status} />

                      {/* Remove button */}
                      {!uploading && sf.status !== "done" && (
                        <button
                          onClick={() => removeFile(sf.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", flexShrink: 0, opacity: 0.5 }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M1 1l10 10M11 1L1 11" stroke="#929292" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* ZIP results breakdown */}
                    {sf.status === "done" && sf.zipResults && sf.zipResults.length > 0 && (
                      <div style={{ marginLeft: "16px", marginTop: "4px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        {sf.zipResults.map((r, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 10px", background: r.status === "queued" ? "#f0fdf4" : r.status === "error" ? "#fff5f5" : "var(--airbnb-surface-soft)", borderRadius: "5px", border: `1px solid ${r.status === "queued" ? "#86efac" : r.status === "error" ? "#fca5a5" : "var(--airbnb-hairline)"}` }}>
                            <span style={{ fontSize: "11px", color: "var(--airbnb-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.filename}</span>
                            <span style={{ fontSize: "10px", fontWeight: 600, color: r.status === "queued" ? "#16a34a" : r.status === "error" ? "#ef4444" : "var(--airbnb-muted)", flexShrink: 0 }}>
                              {r.status === "queued" ? "queued" : r.status === "skipped" ? `skipped — ${r.reason}` : `error — ${r.reason}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderTop: "1px solid var(--airbnb-hairline)", background: "var(--airbnb-surface-soft)", flexShrink: 0, marginTop: staged.length > 0 ? "12px" : 0 }}>
          <div style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>
            {done && staged.length > 0 && (
              <span>
                {doneCount > 0 && <span style={{ color: "#16a34a", marginRight: "8px" }}>✓ {doneCount} uploaded</span>}
                {errorCount > 0 && <span style={{ color: "#ef4444" }}>✗ {errorCount} failed</span>}
              </span>
            )}
            {!done && staged.length > 0 && (
              <span>{staged.length} file{staged.length !== 1 ? "s" : ""} staged{activeWs ? ` → ${activeWs.name}` : ""}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setBulkUploadOpen(false)}
              disabled={uploading}
              style={{ height: "38px", padding: "0 18px", background: "transparent", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--airbnb-body)", cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {done ? "Close" : "Cancel"}
            </button>
            {!done && (
              <button
                onClick={handleUpload}
                disabled={staged.length === 0 || uploading || !wsId}
                style={{
                  height: "38px", padding: "0 20px",
                  background: staged.length === 0 || uploading || !wsId ? "var(--airbnb-surface-strong)" : "var(--airbnb-rausch)",
                  border: "none", borderRadius: "var(--radius-sm)",
                  fontSize: "13px", fontWeight: 600, color: staged.length === 0 || uploading || !wsId ? "var(--airbnb-muted)" : "white",
                  cursor: staged.length === 0 || uploading || !wsId ? "not-allowed" : "pointer",
                  fontFamily: "inherit", minWidth: "120px",
                  transition: "background-color 0.12s ease",
                }}
              >
                {uploading
                  ? `Uploading ${staged.filter((s) => s.status === "uploading").length > 0
                    ? `"${staged.find((s) => s.status === "uploading")?.file.name.slice(0, 20)}…"`
                    : "…"}`
                  : `Upload ${pendingCount > 0 ? `${pendingCount} file${pendingCount !== 1 ? "s" : ""}` : "files"}`
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const map: Record<FileStatus, { label: string; color: string; bg: string }> = {
    staged:    { label: "ready",      color: "var(--airbnb-muted)",  bg: "var(--airbnb-surface-strong)" },
    uploading: { label: "uploading…", color: "#1e40af",              bg: "#dbeafe" },
    done:      { label: "done ✓",     color: "#16a34a",              bg: "#dcfce7" },
    error:     { label: "failed",     color: "#991b1b",              bg: "#fee2e2" },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px", background: s.bg, color: s.color, flexShrink: 0, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
