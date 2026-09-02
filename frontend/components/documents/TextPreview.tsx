"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

// Text preview for non-PDF documents (DOCX, XLSX, PPTX, …).
// Renders the extracted page text served from the parse-time pages.json,
// with the same page-navigation contract as the PDF viewer.
export default function TextPreview({
  documentId,
  page,
}: {
  documentId: string;
  page: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.documents
      .getPage(documentId, page)
      .then((res) => {
        if (!cancelled) {
          setText(res.text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load page");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, page]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>Loading page…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)", margin: 0 }}>Couldn&apos;t load this page</p>
        <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: 0 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--airbnb-surface-soft)" }}>
      <div
        style={{
          margin: "16px",
          padding: "24px 28px",
          background: "var(--airbnb-canvas)",
          border: "1px solid var(--airbnb-hairline)",
          borderRadius: "var(--radius-sm)",
          boxShadow: "rgba(0,0,0,0.04) 0 1px 4px",
          minHeight: "calc(100% - 32px)",
        }}
      >
        {text && text.trim() ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "inherit",
              fontSize: "13px",
              lineHeight: 1.7,
              color: "var(--airbnb-body)",
            }}
          >
            {text}
          </pre>
        ) : (
          <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", fontStyle: "italic", margin: 0 }}>
            This page has no extractable text.
          </p>
        )}
      </div>
    </div>
  );
}
