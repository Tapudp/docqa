"use client";

import { useStore } from "@/lib/store";
import DocumentCard from "@/components/documents/DocumentCard";
import type { DocFile } from "@/lib/mock-data";

export default function RightPanel() {
  const {
    workspace,
    rightTab, setRightTab,
    pdfDocId, pdfPage, setPdfPage, openPdf, closePdf,
    setUploadOpen,
  } = useStore();

  const pdfDoc = workspace.documents.find((d) => d.id === pdfDocId);

  return (
    <aside
      style={{
        width: "340px",
        minWidth: "340px",
        height: "100%",
        background: "var(--airbnb-canvas)",
        borderLeft: "1px solid var(--airbnb-hairline)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
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
          count={workspace.documents.length}
          active={rightTab === "documents"}
          onClick={() => setRightTab("documents")}
        />
        <TabButton
          label="PDF Viewer"
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
                {workspace.name}
              </p>
              <p style={{ fontSize: "11px", color: "var(--airbnb-muted)", marginTop: "1px" }}>
                {workspace.documents.filter((d) => d.status === "ready").length} ready ·{" "}
                {workspace.documents.length} total
              </p>
            </div>
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
          </div>

          {/* Coverage summary bar */}
          <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
            <CoverageBar docs={workspace.documents} />
          </div>

          {/* Scrollable list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "0 8px 12px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {workspace.documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onClick={() => {
                    if (doc.status === "ready" || doc.status === "partial") {
                      openPdf(doc.id, 1);
                    }
                  }}
                />
              ))}
            </div>
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
                Click a citation badge to open the PDF at that page
              </p>
            </div>
          ) : (
            <>
              {/* Doc header */}
              <div
                style={{
                  padding: "10px 14px",
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
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--airbnb-ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pdfDoc.name}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--airbnb-muted)", marginTop: "1px" }}>
                    Page {pdfPage} of {pdfDoc.totalPages}
                  </p>
                </div>
                <button
                  onClick={closePdf}
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
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Page nav */}
              <div
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--airbnb-hairline-soft)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexShrink: 0,
                }}
              >
                <NavBtn
                  dir="prev"
                  disabled={pdfPage <= 1}
                  onClick={() => setPdfPage(Math.max(1, pdfPage - 1))}
                />
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <input
                    type="number"
                    min={1}
                    max={pdfDoc.totalPages}
                    value={pdfPage}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 1 && v <= pdfDoc.totalPages) setPdfPage(v);
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
                  <span style={{ fontSize: "11px", color: "var(--airbnb-muted)" }}>/ {pdfDoc.totalPages}</span>
                </div>
                <NavBtn
                  dir="next"
                  disabled={pdfPage >= pdfDoc.totalPages}
                  onClick={() => setPdfPage(Math.min(pdfDoc.totalPages, pdfPage + 1))}
                />
              </div>

              {/* Simulated page */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "14px",
                }}
              >
                <div
                  key={pdfPage}
                  className="animate-fade-in"
                  style={{
                    background: "white",
                    border: "1px solid var(--airbnb-hairline)",
                    borderRadius: "4px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                    padding: "28px 24px 40px",
                    minHeight: "440px",
                    position: "relative",
                  }}
                >
                  {/* Highlight region */}
                  <div
                    style={{
                      position: "absolute",
                      top: "68px",
                      left: "24px",
                      right: "24px",
                      height: "52px",
                      background: "rgba(255, 56, 92, 0.07)",
                      borderLeft: "3px solid var(--airbnb-rausch)",
                      borderRadius: "0 3px 3px 0",
                    }}
                  />

                  {/* Skeleton lines */}
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: "9px",
                        background:
                          i === 2 || i === 3
                            ? "rgba(255,56,92,0.13)"
                            : "var(--airbnb-surface-strong)",
                        borderRadius: "3px",
                        marginBottom: "9px",
                        width:
                          i % 5 === 0 ? "65%"
                          : i % 4 === 0 ? "88%"
                          : i % 3 === 0 ? "52%"
                          : "100%",
                      }}
                    />
                  ))}

                  {/* Page number */}
                  <p
                    style={{
                      position: "absolute",
                      bottom: "14px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "10px",
                      color: "var(--airbnb-muted-soft)",
                    }}
                  >
                    — {pdfPage} —
                  </p>
                </div>

                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--airbnb-muted-soft)",
                    textAlign: "center",
                    marginTop: "10px",
                  }}
                >
                  PDF.js integration — Phase 2
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

/* ── Sub-components ────────────────────────────────────── */

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
        borderBottom: active
          ? "2px solid var(--airbnb-ink)"
          : "2px solid transparent",
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

function CoverageBar({ docs }: { docs: DocFile[] }) {
  const ready = docs.filter((d) => d.status === "ready").length;
  const partial = docs.filter((d) => d.status === "partial").length;
  const processing = docs.filter((d) => d.status === "parsing" || d.status === "indexing").length;
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
