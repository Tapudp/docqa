"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, setAuth, clearAuth } = useStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("docqa_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    // Token exists but store is empty (e.g. after a page refresh) — re-hydrate
    if (!currentUser) {
      api.auth
        .me()
        .then((user) => {
          setAuth(user, token);
          setChecking(false);
        })
        .catch((err) => {
          // Token is invalid or expired
          if (err instanceof ApiError && err.status === 401) clearAuth();
          router.replace("/login");
        });
    } else {
      setChecking(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--airbnb-canvas)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              border: "3px solid var(--airbnb-hairline)",
              borderTopColor: "var(--airbnb-rausch)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <p style={{ fontSize: "14px", color: "var(--airbnb-muted)" }}>Loading…</p>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--airbnb-canvas)",
      }}
    >
      {children}
    </div>
  );
}
