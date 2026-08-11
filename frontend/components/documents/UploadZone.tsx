"use client";

import { useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api";

const ACCEPTED = [".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".tiff"];

export default function UploadZone() {
  const { setUploadOpen, activeWorkspaceId, addApiDocument } = useStore();
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
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

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setStaged((prev) => [...prev, ...files]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setStaged((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  };

  async function handleUpload() {
    if (!activeWorkspaceId || staged.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      for (const file of staged) {
        const doc = await api.documents.upload(activeWorkspaceId, file);
        if (tags.length > 0) {
          try { await api.documents.setTags(doc.id, tags); doc.tags = tags; } catch { /* non-fatal */ }
        }
        addApiDocument(doc);
      }
      setStaged([]);
      setUploadOpen(false);
    } catch (err) {
      if (err instanceof ApiError) setUploadError(err.message);
      else setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Scrim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.48)",
          cursor: "pointer",
        }}
        onClick={() => { if (!uploading) setUploadOpen(false); }}
      />

      {/* Modal */}
      <div
        className="animate-slide-up"
        style={{
          position: "relative",
          zIndex: 101,
          width: "100%",
          maxWidth: "520px",
          background: "var(--airbnb-canvas)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-card)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--airbnb-hairline)",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--airbnb-ink)" }}>
            Upload documents
          </h2>
          <button
            onClick={() => { if (!uploading) setUploadOpen(false); }}
            style={{
              width: "32px", height: "32px",
              borderRadius: "var(--radius-full)",
              background: "var(--airbnb-surface-strong)",
              border: "none", cursor: uploading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background-color 0.12s ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="#222" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Drop zone */}
        <div style={{ padding: "24px" }}>
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? "var(--airbnb-rausch)" : "var(--airbnb-hairline)"}`,
              borderRadius: "var(--radius-sm)",
              background: dragging ? "#fff5f7" : "var(--airbnb-surface-soft)",
              padding: "40px 24px",
              textAlign: "center",
              transition: "border-color 0.15s ease, background-color 0.15s ease",
              cursor: "default",
            }}
          >
            <div
              style={{
                width: "48px", height: "48px",
                borderRadius: "var(--radius-full)",
                background: dragging ? "#ffd1da" : "var(--airbnb-surface-strong)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: "16px",
                transition: "background-color 0.15s ease",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 14V4M7 8l4-4 4 4" stroke={dragging ? "var(--airbnb-rausch)" : "#6a6a6a"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 16v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" stroke={dragging ? "var(--airbnb-rausch)" : "#6a6a6a"} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>

            <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--airbnb-ink)", marginBottom: "4px" }}>
              {dragging ? "Drop to upload" : "Drag & drop files here"}
            </p>
            <p style={{ fontSize: "13px", color: "var(--airbnb-muted)", marginBottom: "4px" }}>
              PDF, DOCX, XLSX, PPTX, PNG, JPG, TIFF · Max 200 MB
            </p>
            <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", marginBottom: "16px", opacity: 0.7 }}>
              Need to upload larger files? Ask your admin to use Bulk Upload.
            </p>

            <label
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "var(--airbnb-canvas)",
                border: "1px solid var(--airbnb-border-strong)",
                borderRadius: "var(--radius-sm)",
                fontSize: "14px", fontWeight: 500, color: "var(--airbnb-ink)",
                cursor: "pointer",
                transition: "background-color 0.12s ease",
              }}
            >
              Browse files
              <input
                type="file"
                multiple
                accept={ACCEPTED.join(",")}
                onChange={handleFileInput}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {/* Staged files */}
          {staged.length > 0 && (
            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {staged.map((file, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 12px",
                    background: "var(--airbnb-surface-soft)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--airbnb-hairline)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M3 2a1 1 0 0 1 1-1h5.5L13 5.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
                    <path d="M8.5 1v4.5H13" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
                  </svg>
                  <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--airbnb-muted)", flexShrink: 0 }}>
                    {file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`}
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    disabled={uploading}
                    style={{ background: "none", border: "none", cursor: uploading ? "not-allowed" : "pointer", padding: "2px", display: "flex", flexShrink: 0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1l10 10M11 1L1 11" stroke="#929292" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tag input */}
          <div style={{ marginTop: "20px" }}>
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
              onClick={() => (document.getElementById("upload-tag-input") as HTMLInputElement)?.focus()}
            >
              {tags.map((tag) => (
                <span key={tag} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "999px", background: "var(--airbnb-surface-soft)", border: "1px solid var(--airbnb-hairline)", fontSize: "12px", fontWeight: 500, color: "var(--airbnb-ink)" }}>
                  {tag}
                  <button onClick={() => setTags((p) => p.filter((t) => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--airbnb-muted)", fontSize: "13px" }}>×</button>
                </span>
              ))}
              <input
                id="upload-tag-input"
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

          {uploadError && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: "var(--airbnb-error)" }}>
              {uploadError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 24px",
            borderTop: "1px solid var(--airbnb-hairline)",
            background: "var(--airbnb-surface-soft)",
          }}
        >
          <p style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>
            Parser: PaddleOCR · Max 200 MB · For larger files, contact your admin
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => { setStaged([]); setUploadOpen(false); }}
              disabled={uploading}
              style={{
                height: "40px", padding: "0 18px",
                background: "var(--airbnb-canvas)",
                border: "1px solid var(--airbnb-border-strong)",
                borderRadius: "var(--radius-sm)",
                fontSize: "14px", fontWeight: 500, color: "var(--airbnb-ink)",
                cursor: uploading ? "not-allowed" : "pointer",
                transition: "background-color 0.12s ease, transform 0.1s ease",
                fontFamily: "inherit",
              }}
              onMouseDown={(e) => { if (!uploading) e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={staged.length === 0 || uploading}
              style={{
                height: "40px", padding: "0 18px",
                background: staged.length === 0 || uploading ? "var(--airbnb-rausch-disabled)" : "var(--airbnb-rausch)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "14px", fontWeight: 500, color: "white",
                cursor: staged.length === 0 || uploading ? "not-allowed" : "pointer",
                transition: "background-color 0.12s ease, transform 0.1s ease",
                fontFamily: "inherit",
                minWidth: "100px",
              }}
              onMouseDown={(e) => { if (staged.length > 0 && !uploading) e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {uploading ? "Uploading…" : `Upload ${staged.length > 0 ? `${staged.length} file${staged.length > 1 ? "s" : ""}` : "files"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
