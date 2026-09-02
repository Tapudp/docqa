"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  onZoomChange?: (zoom: number) => void;
}

export default function PDFViewer({
  documentId,
  page,
  onPageChange,
  totalPages,
  zoom = 1,
  onZoomChange,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const prevDocId = useRef<string | null>(null);

  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  }, []);

  // Callback ref, not a mount effect: the scroll container is only rendered once the
  // PDF has finished loading, so a []-dep effect runs while the ref is still null and
  // silently observes nothing — which pinned the page to its initial width and made
  // every preview render far smaller than the panel it sits in.
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    setContainerWidth(Math.floor(node.clientWidth));
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.floor(w));
    });
    ro.observe(node);
    observerRef.current = ro;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  // Ctrl/Cmd + wheel zooms, the way every desktop PDF reader behaves.
  // Needs a non-passive listener so preventDefault stops the browser page zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onZoomChange) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoomChange(zoom + (e.deltaY < 0 ? 0.25 : -0.25));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, onZoomChange, blobUrl]);

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
  // zoom = 1 → page fills the container edge-to-edge; > 1 → overflows and scrolls
  const pageWidth = containerWidth > 0 ? Math.floor(containerWidth * zoom) : 0;

  return (
    <div
      ref={attachContainer}
      style={{
        flex: 1,
        minHeight: 0,
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
      >
        {pageWidth > 0 && (
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
        )}
      </Document>
    </div>
  );
}
