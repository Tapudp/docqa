"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    /* Phase 1: mock login — any credentials pass */
    setTimeout(() => {
      setLoading(false);
      router.push("/workspace");
    }, 800);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--airbnb-canvas)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "40px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              background: "var(--airbnb-rausch)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 5h12M4 10h8M4 15h10"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--airbnb-ink)",
              letterSpacing: "-0.18px",
            }}
          >
            NpuDen DocQA
          </span>
        </div>
        <p
          style={{
            marginTop: "8px",
            fontSize: "14px",
            color: "var(--airbnb-muted)",
            fontWeight: 400,
          }}
        >
          Enterprise Document Intelligence
        </p>
      </div>

      {/* Card */}
      <div
        className="animate-slide-up"
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--airbnb-canvas)",
          border: "1px solid var(--airbnb-hairline)",
          borderRadius: "var(--radius-md)",
          padding: "32px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            color: "var(--airbnb-ink)",
            marginBottom: "4px",
            letterSpacing: "-0.44px",
          }}
        >
          Sign in
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "var(--airbnb-muted)",
            marginBottom: "28px",
          }}
        >
          Welcome back to your workspace
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              htmlFor="email"
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--airbnb-muted)",
              }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organization.com"
              style={{
                height: "48px",
                padding: "0 14px",
                border: "1px solid var(--airbnb-hairline)",
                borderRadius: "var(--radius-sm)",
                fontSize: "16px",
                color: "var(--airbnb-ink)",
                background: "var(--airbnb-canvas)",
                outline: "none",
                transition: "border-color 0.15s ease",
                width: "100%",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--airbnb-ink)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--airbnb-hairline)")}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label
                htmlFor="password"
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--airbnb-muted)",
                }}
              >
                Password
              </label>
              <button
                type="button"
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--airbnb-rausch)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                height: "48px",
                padding: "0 14px",
                border: "1px solid var(--airbnb-hairline)",
                borderRadius: "var(--radius-sm)",
                fontSize: "16px",
                color: "var(--airbnb-ink)",
                background: "var(--airbnb-canvas)",
                outline: "none",
                transition: "border-color 0.15s ease",
                width: "100%",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--airbnb-ink)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--airbnb-hairline)")}
            />
          </div>

          {/* Error */}
          {error && (
            <p
              style={{
                fontSize: "13px",
                color: "var(--airbnb-error)",
                marginTop: "-4px",
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "8px",
              height: "48px",
              background: loading ? "var(--airbnb-rausch-disabled)" : "var(--airbnb-rausch)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "16px",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease, transform 0.1s ease",
              width: "100%",
            }}
            onMouseDown={(e) => {
              if (!loading) (e.currentTarget.style.transform = "scale(0.97)");
            }}
            onMouseUp={(e) => {
              (e.currentTarget.style.transform = "scale(1)");
            }}
            onMouseLeave={(e) => {
              (e.currentTarget.style.transform = "scale(1)");
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            margin: "24px 0",
          }}
        >
          <div style={{ flex: 1, height: "1px", background: "var(--airbnb-hairline)" }} />
          <span style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "var(--airbnb-hairline)" }} />
        </div>

        {/* SSO hint */}
        <button
          type="button"
          style={{
            width: "100%",
            height: "48px",
            background: "var(--airbnb-canvas)",
            border: "1px solid var(--airbnb-border-strong)",
            borderRadius: "var(--radius-sm)",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--airbnb-ink)",
            cursor: "pointer",
            transition: "background-color 0.15s ease, transform 0.1s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1" fill="#4285F4" />
            <rect x="9" y="1" width="6" height="6" rx="1" fill="#EA4335" />
            <rect x="1" y="9" width="6" height="6" rx="1" fill="#34A853" />
            <rect x="9" y="9" width="6" height="6" rx="1" fill="#FBBC05" />
          </svg>
          Continue with SSO
        </button>
      </div>

      {/* Footer */}
      <p
        style={{
          marginTop: "32px",
          fontSize: "13px",
          color: "var(--airbnb-muted-soft)",
          textAlign: "center",
        }}
      >
        © 2026 NpuDen. All rights reserved.
      </p>
    </div>
  );
}
