"use client";

import type { ApiDocument } from "@/lib/types";

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
  // "parsed" — may be partial
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
  const meta = getCoverageMeta(doc);
  const isPartial = doc.status === "parsed" && doc.total_pages != null && doc.parsed_pages < doc.total_pages;

  return (
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

        <div style={{ flex: 1, minWidth: 0 }}>
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
  );
}
