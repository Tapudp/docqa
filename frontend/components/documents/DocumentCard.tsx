"use client";

import type { DocFile } from "@/lib/mock-data";

interface Props {
  doc: DocFile;
  selected?: boolean;
  onClick?: () => void;
}

type CoverageMeta = {
  label: string;
  icon: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};

function getCoverageMeta(doc: DocFile): CoverageMeta {
  if (doc.status === "parsing" || doc.status === "indexing") {
    return {
      label: `${doc.parsedPages}/${doc.totalPages} parsing…`,
      icon: "⏳",
      textColor: "#1e40af",
      bgColor:   "#dbeafe",
      borderColor: "#93c5fd",
    };
  }
  if (doc.status === "error") {
    return {
      label: `${doc.parsedPages}/${doc.totalPages} error`,
      icon: "✕",
      textColor: "#991b1b",
      bgColor:   "#fee2e2",
      borderColor: "#fca5a5",
    };
  }
  if (doc.parsedPages === doc.totalPages) {
    return {
      label: `${doc.parsedPages}/${doc.totalPages} ✓`,
      icon: "",
      textColor: "#166534",
      bgColor:   "#dcfce7",
      borderColor: "#86efac",
    };
  }
  return {
    label: `${doc.parsedPages}/${doc.totalPages} ⚠️`,
    icon: "",
    textColor: "#92400e",
    bgColor:   "#fef3c7",
    borderColor: "#fcd34d",
  };
}

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function DocumentCard({ doc, selected, onClick }: Props) {
  const meta = getCoverageMeta(doc);

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
        border: selected
          ? "1px solid var(--airbnb-hairline)"
          : "1px solid transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background-color 0.12s ease, border-color 0.12s ease",
      }}
    >
      {/* Top row: icon + name */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        {/* File icon */}
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
            <path
              d="M2 2a1 1 0 0 1 1-1h5.5L11 4.5V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2z"
              stroke="#6a6a6a"
              strokeWidth="1.2"
              fill="none"
            />
            <path d="M7.5 1v3.5H11" stroke="#6a6a6a" strokeWidth="1.2" fill="none" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--airbnb-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "1.3",
            }}
          >
            {doc.name}
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "var(--airbnb-muted)",
              marginTop: "2px",
            }}
          >
            {formatSize(doc.sizeKb)} · {doc.uploadedAt}
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

        {doc.status === "partial" && doc.failedPages && (
          <p
            style={{
              fontSize: "11px",
              color: "var(--airbnb-muted)",
              marginTop: "4px",
            }}
          >
            Pages {doc.failedPages.join(", ")} failed
          </p>
        )}
      </div>
    </button>
  );
}
