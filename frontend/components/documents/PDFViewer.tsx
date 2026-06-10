"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Props {
  documentId: string;
  page: number;
  onPageChange: (page: number) => void;
  totalPages: number | null;
  zoom?: number;
}

export default function PDFViewer({ documentId, page, onPageChange, totalPages, zoom = 1 }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(300);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevDocId = useRef<string | null>(null);

  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.floor(w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!documentId) return;

    if (prevDocId.current !== documentId && blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    prevDocId.current = documentId;

    setLoading(true);
    setError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("docqa_token") : null;

    fetch(`${BASE}/api/documents/${documentId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? "Failed to load PDF");
        setLoading(false);
      });
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
        <div style={{ width: "32px", height: "32px", border: "2px solid var(--airbnb-hairline)", borderTopColor: "var(--airbnb-rausch)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <p style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>Loading PDF…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <p style={{ fontSize: "12px", color: "var(--airbnb-error, #ef4444)", textAlign: "center" }}>
          Could not load PDF: {error}
        </p>
      </div>
    );
  }

  const maxPage = numPages ?? totalPages ?? 999;
  // zoom=1 → page fills container edge-to-edge (no grey sides)
  // zoom>1 → page wider than container, horizontal scroll kicks in
  const pageWidth = Math.floor(containerWidth * zoom);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: zoom > 1 ? "auto" : "hidden",
        background: "#f0f0f0",
      }}
    >
      <Document
        file={blobUrl}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          if (page > n) onPageChange(n);
        }}
        onLoadError={(err) => setError(err.message)}
        loading={null}
        style={{ width: "100%" }}
      >
        <Page
          key={`${documentId}-${page}-${zoom}`}
          pageNumber={Math.min(page, maxPage)}
          width={pageWidth}
          renderTextLayer
          renderAnnotationLayer
          loading={
            <div style={{ height: "400px", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>Rendering…</p>
            </div>
          }
        />
      </Document>
    </div>
  );
}
