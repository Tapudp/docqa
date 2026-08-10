"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import type { ApiDocument } from "@/lib/types";

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
    <div
      style={{
        width: "38px",
        height: "38px",
        borderRadius: "8px",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: "10px", fontWeight: 700, color, letterSpacing: "0.02em" }}>
        {label}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    ready: { label: "Indexed", bg: "#dcfce7", color: "#15803d" },
    indexing: { label: "Indexing", bg: "#fef9c3", color: "#a16207" },
    chunking: { label: "Chunking", bg: "#fef9c3", color: "#a16207" },
    parsing: { label: "Parsing", bg: "#fef9c3", color: "#a16207" },
    received: { label: "Queued", bg: "#f3f4f6", color: "#6b7280" },
    error: { label: "Error", bg: "#fee2e2", color: "#dc2626" },
  };
  const { label, bg, color } = config[status] ?? config.received;
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "999px",
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function FileRow({ doc, isSelected, onClick }: {
  doc: ApiDocument;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "12px 16px",
        borderRadius: "10px",
        cursor: "pointer",
        background: isSelected
          ? "var(--airbnb-surface-soft)"
          : hovered
          ? "var(--airbnb-surface-soft)"
          : "transparent",
        border: isSelected
          ? "1px solid var(--airbnb-hairline)"
          : "1px solid transparent",
        transition: "background 0.1s ease, border-color 0.1s ease",
      }}
    >
      <FileTypeIcon mime={doc.mime_type} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--airbnb-ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doc.filename}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--airbnb-muted)" }}>
          {formatSize(doc.file_size)} · {formatDate(doc.created_at)}
        </p>
      </div>

      <StatusBadge status={doc.status} />

      {isSelected && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <path d="M5 3l5 4-5 4" stroke="var(--airbnb-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export default function WorkspaceLibrary() {
  const { apiDocuments, apiWorkspaces, activeWorkspaceId, openPdf, pdfDocId } = useStore();
  const [query, setQuery] = useState("");

  const activeWorkspace = apiWorkspaces.find((w) => w.id === activeWorkspaceId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const docs = q
      ? apiDocuments.filter((d) => d.filename.toLowerCase().includes(q))
      : apiDocuments;
    return docs.slice(0, MAX_VISIBLE);
  }, [apiDocuments, query]);

  const totalCount = apiDocuments.length;
  const indexedCount = apiDocuments.filter((d) => d.status === "ready").length;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--airbnb-canvas)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "40px 48px 28px",
          borderBottom: "1px solid var(--airbnb-hairline)",
          background: "var(--airbnb-canvas)",
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "var(--airbnb-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {activeWorkspace?.name ?? "Workspace"}
        </p>
        <h1 style={{ margin: "0 0 20px", fontSize: "22px", fontWeight: 700, color: "var(--airbnb-ink)", letterSpacing: "-0.3px" }}>
          Document Library
        </h1>

        {/* Search bar */}
        <div
          style={{
            position: "relative",
            maxWidth: "560px",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <circle cx="7" cy="7" r="5" stroke="var(--airbnb-muted)" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="var(--airbnb-muted)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename…"
            style={{
              width: "100%",
              height: "44px",
              paddingLeft: "40px",
              paddingRight: "16px",
              fontSize: "14px",
              color: "var(--airbnb-ink)",
              background: "var(--airbnb-surface-soft)",
              border: "1px solid var(--airbnb-hairline)",
              borderRadius: "10px",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--airbnb-ink)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,34,34,0.06)";
              e.currentTarget.style.background = "var(--airbnb-canvas)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--airbnb-hairline)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.background = "var(--airbnb-surface-soft)";
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px",
                color: "var(--airbnb-muted)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Stats row */}
        <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--airbnb-muted)" }}>
          {query
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${query}"`
            : `${totalCount} file${totalCount !== 1 ? "s" : ""} · ${indexedCount} indexed`}
        </p>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 40px 32px" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              padding: "80px 0",
              color: "var(--airbnb-muted)",
            }}
          >
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
    </div>
  );
}
