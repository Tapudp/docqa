"use client";

import { useState } from "react";
import type { ApiDocument } from "@/lib/types";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Props {
  doc: ApiDocument;
  selected?: boolean;
  onClick?: () => void;
}

type CoverageMeta = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};

function getCoverageMeta(doc: ApiDocument): CoverageMeta {
  const { status, parsed_pages, total_pages, chunk_count } = doc;

  if (status === "received") {
    return { label: "queued", textColor: "#1e40af", bgColor: "#dbeafe", borderColor: "#93c5fd" };
  }
  if (status === "parsing" || status === "chunking" || status === "indexing") {
    const progress = total_pages ? `${parsed_pages}/${total_pages} ` : "";
    return { label: `${progress}${status}…`, textColor: "#1e40af", bgColor: "#dbeafe", borderColor: "#93c5fd" };
  }
  if (status === "error") {
    return { label: "error", textColor: "#991b1b", bgColor: "#fee2e2", borderColor: "#fca5a5" };
  }
  if (status === "ready") {
    const pages = total_pages ? `${total_pages}p` : "";
    const chunks = chunk_count ? ` · ${chunk_count} chunks` : "";
    return { label: `ready ✓  ${pages}${chunks}`.trim(), textColor: "#166534", bgColor: "#dcfce7", borderColor: "#86efac" };
  }
  if (total_pages && parsed_pages < total_pages) {
    return { label: `${parsed_pages}/${total_pages} ⚠️`, textColor: "#92400e", bgColor: "#fef3c7", borderColor: "#fcd34d" };
  }
  return { label: `${parsed_pages}/${total_pages ?? "?"} ✓`, textColor: "#166534", bgColor: "#dcfce7", borderColor: "#86efac" };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function DocumentCard({ doc, selected, onClick }: Props) {
  const removeApiDocument = useStore((s) => s.removeApiDocument);
  const [hovered, setHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meta = getCoverageMeta(doc);
  const isPartial = doc.status === "parsed" && doc.total_pages != null && doc.parsed_pages < doc.total_pages;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      await api.documents.delete(doc.id);
      removeApiDocument(doc.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          width: "100%",
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          background: selected ? "var(--airbnb-surface-strong)" : "transparent",
          border: selected ? "1px solid var(--airbnb-hairline)" : "1px solid transparent",
          cursor: "pointer",
          textAlign: "left",
          transition: "background-color 0.12s ease, border-color 0.12s ease",
          fontFamily: "inherit",
        }}
      >
        {/* Top row: icon + name */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <div
            style={{
              flexShrink: 0,
              marginTop: "1px",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "var(--airbnb-surface-soft)",
              border: "1px solid var(--airbnb-hairline)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2a1 1 0 0 1 1-1h5.5L11 4.5V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2z" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
              <path d="M7.5 1v3.5H11" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0, paddingRight: "24px" }}>
            <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--airbnb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "1.3" }}>
              {doc.filename}
            </p>
            <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", marginTop: "2px" }}>
              {formatSize(doc.file_size)} · {formatDate(doc.created_at)}
            </p>
          </div>
        </div>

        {/* Coverage badge */}
        <div style={{ paddingLeft: "36px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              fontSize: "11px",
              fontWeight: 600,
              color: meta.textColor,
              background: meta.bgColor,
              border: `1px solid ${meta.borderColor}`,
              borderRadius: "var(--radius-full)",
              padding: "2px 8px",
              lineHeight: 1.4,
            }}
          >
            {meta.label}
          </span>

          {isPartial && doc.failed_pages && doc.failed_pages.length > 0 && (
            <p style={{ fontSize: "11px", color: "var(--airbnb-muted)", marginTop: "4px" }}>
              Pages {doc.failed_pages.join(", ")} failed
            </p>
          )}
        </div>
      </button>

      {/* Delete button — appears on hover */}
      {hovered && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Remove document"
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            width: "22px",
            height: "22px",
            borderRadius: "5px",
            background: deleting ? "var(--airbnb-surface-soft)" : "var(--airbnb-canvas)",
            border: "1px solid var(--airbnb-hairline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: deleting ? "not-allowed" : "pointer",
            transition: "background-color 0.1s ease",
            padding: 0,
          }}
          onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.borderColor = "#fca5a5"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--airbnb-canvas)"; e.currentTarget.style.borderColor = "var(--airbnb-hairline)"; }}
        >
          {deleting ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
              <circle cx="5" cy="5" r="3.5" stroke="#aaa" strokeWidth="1.5" strokeDasharray="5 4" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
