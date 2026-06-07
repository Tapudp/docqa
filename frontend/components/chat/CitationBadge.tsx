"use client";

import type { Citation } from "@/lib/types";
import { useStore } from "@/lib/store";

interface Props {
  citation: Citation;
}

export default function CitationBadge({ citation }: Props) {
  const openPdf = useStore((s) => s.openPdf);
  const firstPage = citation.page_numbers[0] ?? 1;

  return (
    <button
      onClick={() => openPdf(citation.document_id, firstPage)}
      title={`${citation.filename} — p.${citation.page_numbers.join(",")}\n"${citation.snippet}"`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: "var(--radius-full)",
        fontSize: "12px",
        fontWeight: 600,
        color: "#1d4ed8",
        cursor: "pointer",
        verticalAlign: "middle",
        lineHeight: 1.5,
        transition: "background-color 0.12s ease, border-color 0.12s ease",
        maxWidth: "200px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M1.5 1.5h7v7h-7zM3.5 1.5v7M1.5 3.5h6"
          stroke="#1d4ed8"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {citation.filename.replace(/\.[^.]+$/, "")} p.{firstPage}
    </button>
  );
}
