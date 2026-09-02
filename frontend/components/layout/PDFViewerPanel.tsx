"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import DocumentCard from "@/components/documents/DocumentCard";
import TextPreview from "@/components/documents/TextPreview";
import type { ApiDocument } from "@/lib/types";

const PDFViewer = dynamic(() => import("@/components/documents/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: "12px", color: "var(--airbnb-muted)" }}>Loading viewer…</p>
    </div>
  ),
});

const DEFAULT_PANEL_WIDTH = 620;
const MIN_PANEL_WIDTH = 380;
const SIDEBAR_WIDTH = 260;
const MIN_CHAT_WIDTH = 360;
const PANEL_WIDTH_KEY = "docqa_pdf_panel_width";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

const clampZoom = (z: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat(z.toFixed(2))));

function clampWidth(w: number) {
  const max = Math.max(MIN_PANEL_WIDTH, window.innerWidth - SIDEBAR_WIDTH - MIN_CHAT_WIDTH);
  return Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, w)));
}

export default function RightPanel() {
  const {
    apiWorkspaces, activeWorkspaceId,
    apiDocuments,
    rightTab, setRightTab,
    pdfDocId, pdfPage, setPdfPage, openPdf, closePdf,
    setUploadOpen,
  } = useStore();

  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const draggingRef = useRef(false);
  const panelWidthRef = useRef(DEFAULT_PANEL_WIDTH);

  const activeWorkspace = apiWorkspaces.find((w) => w.id === activeWorkspaceId);
  const memberRole = activeWorkspace?.member_role ?? "viewer";
  const canWrite = memberRole === "member" || memberRole === "admin";

  // Use real docs when available, fall back to empty (mock chat still works)
  const docs = apiDocuments;
  const pdfDoc = docs.find((d) => d.id === pdfDocId);
  const isPdf = !!pdfDoc && pdfDoc.mime_type === "application/pdf";

  const applyWidth = useCallback((w: number) => {
    const next = clampWidth(w);
    panelWidthRef.current = next;
    setPanelWidth(next);
  }, []);

  // Restore the width the user last dragged to
  useEffect(() => {
    let saved = NaN;
    try {
      saved = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? "", 10);
    } catch {
      /* private mode / storage disabled — fall back to the default */
    }
    applyWidth(Number.isNaN(saved) ? DEFAULT_PANEL_WIDTH : saved);
  }, [applyWidth]);

  // Drag the left edge to resize
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      applyWidth(window.innerWidth - e.clientX);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current));
      } catch {
        /* nothing to do — the width still applies for this session */
      }
    }
    function onResize() {
      applyWidth(panelWidthRef.current);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("resize", onResize);
    };
  }, [applyWidth]);

  // Esc leaves the expanded viewer
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Don't strand the overlay open when the document closes or isn't previewable
  useEffect(() => {
    if (expanded && !isPdf) setExpanded(false);
  }, [expanded, isPdf]);

  function startDrag() {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  /* ── PDF chrome — rendered docked in the panel, or inside the expanded overlay ── */
  function renderPdfChrome(mode: "docked" | "expanded") {
    if (!pdfDoc) return null;
    const big = mode === "expanded";

    return (
      <>
        {/* Doc header */}
        <div
          style={{
            padding: big ? "12px 18px" : "10px 14px",
            borderBottom: "1px solid var(--airbnb-hairline)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: big ? "14px" : "12px",
                fontWeight: 600,
                color: "var(--airbnb-ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pdfDoc.filename}
            </p>
            <p style={{ fontSize: "11px", color: "var(--airbnb-muted)", marginTop: "1px" }}>
              Page {pdfPage} of {pdfDoc.total_pages ?? "?"}
            </p>
          </div>

          {isPdf && (
            <IconBtn
              onClick={() => setExpanded(!big)}
              title={big ? "Exit expanded view (Esc)" : "Expand to full screen"}
            >
              {big ? (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M4.5 1v3.5H1M6.5 10V6.5H10" stroke="#6a6a6a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1 4V1h3M10 7v3H7" stroke="#6a6a6a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M1 1l3.5 3.5M10 10L6.5 6.5" stroke="#6a6a6a" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </IconBtn>
          )}

          <IconBtn
            onClick={() => {
              setExpanded(false);
              closePdf();
            }}
            title="Close document"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </IconBtn>
        </div>

        {/* Page nav + zoom */}
        <div
          style={{
            padding: big ? "10px 18px" : "8px 14px",
            borderBottom: "1px solid var(--airbnb-hairline-soft)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <NavBtn dir="prev" disabled={pdfPage <= 1} onClick={() => setPdfPage(Math.max(1, pdfPage - 1))} />
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="number"
              min={1}
              max={pdfDoc.total_pages ?? 999}
              value={pdfPage}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= (pdfDoc.total_pages ?? 999)) setPdfPage(v);
              }}
              style={{
                width: "44px",
                height: "26px",
                border: "1px solid var(--airbnb-hairline)",
                borderRadius: "var(--radius-xs)",
                textAlign: "center",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--airbnb-ink)",
                outline: "none",
              }}
            />
            <span style={{ fontSize: "11px", color: "var(--airbnb-muted)" }}>/ {pdfDoc.total_pages ?? "?"}</span>
          </div>
          <NavBtn
            dir="next"
            disabled={pdfDoc.total_pages != null && pdfPage >= pdfDoc.total_pages}
            onClick={() => setPdfPage(Math.min(pdfDoc.total_pages ?? 999, pdfPage + 1))}
          />

          {isPdf && (
            <>
              <div style={{ width: "1px", height: "16px", background: "var(--airbnb-hairline)", flexShrink: 0 }} />

              {/* Zoom controls */}
              <ZoomBtn disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M2 4.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </ZoomBtn>
              <button
                onClick={() => setZoom(1)}
                title="Reset zoom to fit width — Ctrl/⌘ + scroll also zooms"
                style={{
                  height: "22px",
                  minWidth: "42px",
                  padding: "0 4px",
                  background: "transparent",
                  border: "1px solid var(--airbnb-hairline)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--airbnb-ink)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.01em",
                }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <ZoomBtn disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M4.5 2v5M2 4.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </ZoomBtn>
            </>
          )}

          {big && (
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--airbnb-muted)" }}>
              Ctrl/⌘ + scroll to zoom · Esc to exit
            </span>
          )}
        </div>

        {isPdf ? (
          <PDFViewer
            documentId={pdfDoc.id}
            page={pdfPage}
            onPageChange={setPdfPage}
            totalPages={pdfDoc.total_pages ?? null}
            zoom={zoom}
            onZoomChange={(z) => setZoom(clampZoom(z))}
          />
        ) : (
          <TextPreview documentId={pdfDoc.id} page={pdfPage} />
        )}
      </>
    );
  }

  return (
    <>
      <aside
        style={{
          width: `${panelWidth}px`,
          minWidth: `${panelWidth}px`,
          height: "100%",
          background: "var(--airbnb-canvas)",
          borderLeft: "1px solid var(--airbnb-hairline)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Drag handle — widen or narrow the panel */}
        <div
          onMouseDown={startDrag}
          onDoubleClick={() => {
            applyWidth(DEFAULT_PANEL_WIDTH);
            try {
              localStorage.setItem(PANEL_WIDTH_KEY, String(DEFAULT_PANEL_WIDTH));
            } catch {
              /* width still applies for this session */
            }
          }}
          title="Drag to resize · double-click to reset"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "6px",
            height: "100%",
            cursor: "col-resize",
            zIndex: 5,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--airbnb-hairline)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        />

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--airbnb-hairline)",
            background: "var(--airbnb-surface-soft)",
            flexShrink: 0,
          }}
        >
          <TabButton
            label="Documents"
            icon={
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="M2 1.5A.5.5 0 0 1 2.5 1h5.793L10.5 3.207V11.5a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V1.5z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
                <path d="M7.5 1v2.5H10.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            }
            count={docs.length}
            active={rightTab === "documents"}
            onClick={() => setRightTab("documents")}
          />
          <TabButton
            label="Viewer"
            icon={
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                <path d="M4 5.5h5M4 7.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            }
            active={rightTab === "pdf"}
            onClick={() => setRightTab("pdf")}
            highlight={!!pdfDocId}
          />
        </div>

        {/* ── Documents tab ───────────────────────────────────── */}
        {rightTab === "documents" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div
              style={{
                padding: "12px 16px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)" }}>
                  {activeWorkspace?.name ?? "Documents"}
                </p>
                <p style={{ fontSize: "11px", color: "var(--airbnb-muted)", marginTop: "1px" }}>
                  {docs.filter((d) => d.status === "ready").length} ready · {docs.length} total
                </p>
              </div>
              {canWrite && (
                <button
                  onClick={() => setUploadOpen(true)}
                  style={{
                    height: "32px",
                    padding: "0 12px",
                    background: "var(--airbnb-rausch)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "background-color 0.12s ease, transform 0.1s ease",
                    flexShrink: 0,
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Upload
                </button>
              )}
            </div>

            {/* Coverage summary bar */}
            {docs.length > 0 && (
              <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
                <CoverageBar docs={docs} />
              </div>
            )}

            {/* Scrollable list */}
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px 12px" }}>
              {docs.length === 0 ? (
                <div style={{ padding: "40px 16px", textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>
                    No documents yet. Upload one to get started.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {docs.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      canDelete={canWrite}
                      onClick={() => {
                        if (doc.status === "ready") openPdf(doc.id, 1);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PDF Viewer tab ──────────────────────────────────── */}
        {rightTab === "pdf" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {!pdfDoc ? (
              /* Empty state */
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--airbnb-surface-strong)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="3" y="2" width="12" height="16" rx="2" stroke="#c1c1c1" strokeWidth="1.5" fill="none" />
                    <path d="M6 7h6M6 10h4M6 13h5" stroke="#c1c1c1" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M14 8l5 5-5 5" stroke="#c1c1c1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p style={{ fontSize: "13px", color: "var(--airbnb-muted)", textAlign: "center" }}>
                  Click a citation badge to open the document at that page
                </p>
              </div>
            ) : expanded ? (
              /* Chrome has moved into the overlay — leave a way back */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "32px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--airbnb-ink)", margin: 0 }}>Open in expanded view</p>
                <p style={{ fontSize: "12px", color: "var(--airbnb-muted)", margin: 0, lineHeight: 1.5 }}>
                  {pdfDoc.filename}
                </p>
                <button
                  onClick={() => setExpanded(false)}
                  style={{ marginTop: "4px", height: "32px", padding: "0 16px", background: "transparent", border: "1px solid var(--airbnb-hairline)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--airbnb-body)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Dock it back here
                </button>
              </div>
            ) : (
              renderPdfChrome("docked")
            )}
          </div>
        )}
      </aside>

      {/* ── Expanded viewer overlay ─────────────────────────── */}
      {expanded && isPdf && (
        <>
          <div
            onClick={() => setExpanded(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 200,
              backdropFilter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "2vh",
              left: "1.5vw",
              width: "97vw",
              height: "96vh",
              zIndex: 201,
              background: "var(--airbnb-canvas)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {renderPdfChrome("expanded")}
          </div>
        </>
      )}
    </>
  );
}

/* ── Sub-components ────────────────────────────────────── */

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: "26px",
        height: "26px",
        borderRadius: "var(--radius-full)",
        background: "var(--airbnb-surface-strong)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  count,
  highlight,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: "42px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "5px",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--airbnb-ink)" : "2px solid transparent",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--airbnb-ink)" : "var(--airbnb-muted)",
        transition: "color 0.12s ease, border-color 0.12s ease",
        position: "relative",
      }}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            background: active ? "var(--airbnb-ink)" : "var(--airbnb-surface-strong)",
            color: active ? "white" : "var(--airbnb-muted)",
            borderRadius: "var(--radius-full)",
            padding: "1px 5px",
            lineHeight: 1.6,
          }}
        >
          {count}
        </span>
      )}
      {highlight && !active && (
        <span
          style={{
            position: "absolute",
            top: "8px",
            right: "12px",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--airbnb-rausch)",
          }}
        />
      )}
    </button>
  );
}

function ZoomBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "22px",
        height: "22px",
        borderRadius: "var(--radius-xs)",
        background: "var(--airbnb-canvas)",
        border: "1px solid var(--airbnb-hairline)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        color: "var(--airbnb-ink)",
        flexShrink: 0,
        transition: "background-color 0.1s ease",
      }}
    >
      {children}
    </button>
  );
}

function NavBtn({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "26px",
        height: "26px",
        borderRadius: "var(--radius-full)",
        background: "var(--airbnb-canvas)",
        border: "1px solid var(--airbnb-hairline)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        flexShrink: 0,
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        {dir === "prev" ? (
          <path d="M6 2L3 4.5l3 2.5" stroke="#222" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3 2l3 2.5L3 7" stroke="#222" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

function CoverageBar({ docs }: { docs: ApiDocument[] }) {
  const ready = docs.filter((d) => d.status === "ready").length;
  const partial = docs.filter((d) => d.status === "parsed" && d.total_pages != null && d.parsed_pages < d.total_pages).length;
  const processing = docs.filter((d) => ["received", "parsing", "chunking", "indexing"].includes(d.status)).length;
  const total = docs.length;

  const pctReady = (ready / total) * 100;
  const pctPartial = (partial / total) * 100;
  const pctProcessing = (processing / total) * 100;

  return (
    <div>
      <div
        style={{
          height: "4px",
          borderRadius: "var(--radius-full)",
          background: "var(--airbnb-surface-strong)",
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div style={{ width: `${pctReady}%`, background: "#22c55e", transition: "width 0.3s ease" }} />
        <div style={{ width: `${pctPartial}%`, background: "#f59e0b", transition: "width 0.3s ease" }} />
        <div style={{ width: `${pctProcessing}%`, background: "#60a5fa", transition: "width 0.3s ease" }} />
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
        <LegendDot color="#22c55e" label={`${ready} ready`} />
        {partial > 0 && <LegendDot color="#f59e0b" label={`${partial} partial`} />}
        {processing > 0 && <LegendDot color="#60a5fa" label={`${processing} processing`} />}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: color }} />
      <span style={{ fontSize: "10px", color: "var(--airbnb-muted)" }}>{label}</span>
    </div>
  );
}
