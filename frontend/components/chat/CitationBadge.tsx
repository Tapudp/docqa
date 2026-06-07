"use client";

import type { Citation } from "@/lib/mock-data";
import { useStore } from "@/lib/store";

interface Props {
  citation: Citation;
}

export default function CitationBadge({ citation }: Props) {
  const openPdf = useStore((s) => s.openPdf);

  function handleClick() {
    openPdf(citation.documentId, citation.pageNumber);
  }

  return (
    <button
      onClick={handleClick}
      title={`${citation.documentName} — Page ${citation.pageNumber}${citation.excerpt ? `\n"${citation.excerpt}"` : ""}`}
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
      Page {citation.pageNumber}
    </button>
  );
}
