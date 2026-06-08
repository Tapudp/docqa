"use client";

import type { Citation } from "@/lib/types";
import { useStore } from "@/lib/store";

interface Props {
  citation: Citation;
}

export default function CitationBadge({ citation }: Props) {
  const openPdf = useStore((s) => s.openPdf);
  const firstPage = citation.page_numbers[0] ?? 1;
  const pageLabel = citation.page_numbers.length > 1
    ? `pp. ${citation.page_numbers.join(", ")}`
    : `p. ${firstPage}`;

  // Strip extension for display, keep full name for tooltip
  const displayName = citation.filename.replace(/\.[^/.]+$/, "");

  return (
    <button
      onClick={() => openPdf(citation.document_id, firstPage)}
      title={`${citation.filename} — ${pageLabel}\n"${citation.snippet}"`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "7px 10px",
        background: "#f0f7ff",
        border: "1px solid #dbeafe",
        borderRadius: "8px",
        cursor: "pointer",
        textAlign: "left",
        transition: "background-color 0.12s ease, border-color 0.12s ease",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#dbeafe";
        e.currentTarget.style.borderColor = "#93c5fd";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#f0f7ff";
        e.currentTarget.style.borderColor = "#dbeafe";
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {/* Doc icon */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", background: "white", border: "1px solid #bfdbfe", borderRadius: "6px" }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2 1.5A.5.5 0 0 1 2.5 1h5.293L9.5 3.207V11.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5V1.5z" stroke="#2563eb" strokeWidth="1.1" fill="none" />
          <path d="M7 1v2.5H9.5" stroke="#2563eb" strokeWidth="1.1" fill="none" />
          <path d="M3.5 6h5M3.5 8h3.5" stroke="#93c5fd" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>

      {/* Filename */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: "12px",
          fontWeight: 500,
          color: "#1e40af",
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.4,
        }}>
          {displayName}
        </p>
      </div>

      {/* Page badge */}
      <div style={{
        flexShrink: 0,
        fontSize: "11px",
        fontWeight: 600,
        color: "#1d4ed8",
        background: "white",
        border: "1px solid #bfdbfe",
        borderRadius: "20px",
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}>
        {pageLabel}
      </div>

      {/* Arrow */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
        <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="#1d4ed8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
