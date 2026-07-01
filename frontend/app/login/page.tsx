"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useStore((s) => s.setAuth);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === "login"
          ? await api.auth.login(email, password)
          : await api.auth.register(email, password, displayName || undefined);

      setAuth(res.user, res.access_token);
      router.push("/workspace");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not reach the server. Is it running?");
      }
    } finally {
      setLoading(false);
    }
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
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
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
              <path d="M4 5h12M4 10h8M4 15h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: "20px", fontWeight: 600, color: "var(--airbnb-ink)", letterSpacing: "-0.18px" }}>
            REVERB by NpuDen
          </span>
        </div>
        <p style={{ marginTop: "8px", fontSize: "14px", color: "var(--airbnb-muted)" }}>
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
        <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--airbnb-ink)", marginBottom: "4px", letterSpacing: "-0.44px" }}>
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--airbnb-muted)", marginBottom: "28px" }}>
          {mode === "login" ? "Welcome back to your workspace" : "Get started with REVERB by NpuDen"}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Display name — register only */}
          {mode === "register" && (
            <Field label="Display name">
              <TextInput
                type="text"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Your name"
                autoComplete="name"
              />
            </Field>
          )}

          <Field label="Email address">
            <TextInput
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@organization.com"
              autoComplete="email"
            />
          </Field>

          <Field
            label="Password"
            aside={
              mode === "login" ? (
                <button
                  type="button"
                  style={{ fontSize: "13px", fontWeight: 500, color: "var(--airbnb-rausch)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Forgot password?
                </button>
              ) : undefined
            }
          >
            <TextInput
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Field>

          {error && (
            <p style={{ fontSize: "13px", color: "var(--airbnb-error)", marginTop: "-4px" }}>
              {error}
            </p>
          )}

          <PrimaryButton loading={loading}>
            {loading
              ? mode === "login" ? "Signing in…" : "Creating account…"
              : mode === "login" ? "Sign in" : "Create account"}
          </PrimaryButton>
        </form>

        {/* SSO — disabled until Phase 6 */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--airbnb-hairline)" }} />
          <span style={{ fontSize: "13px", color: "var(--airbnb-muted)" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "var(--airbnb-hairline)" }} />
        </div>

        <button
          type="button"
          disabled
          title="SSO login coming soon"
          style={{
            width: "100%", height: "48px",
            background: "var(--airbnb-surface-soft)",
            border: "1px solid var(--airbnb-hairline)",
            borderRadius: "var(--radius-sm)",
            fontSize: "14px", fontWeight: 500, color: "var(--airbnb-muted-soft)",
            cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            fontFamily: "inherit",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
            <rect x="1" y="1" width="6" height="6" rx="1" fill="#4285F4" />
            <rect x="9" y="1" width="6" height="6" rx="1" fill="#EA4335" />
            <rect x="1" y="9" width="6" height="6" rx="1" fill="#34A853" />
            <rect x="9" y="9" width="6" height="6" rx="1" fill="#FBBC05" />
          </svg>
          Continue with SSO
          <span style={{ fontSize: "11px", background: "var(--airbnb-hairline)", borderRadius: "4px", padding: "1px 6px", marginLeft: "4px" }}>
            coming soon
          </span>
        </button>

        {/* Mode toggle */}
        <p style={{ textAlign: "center", fontSize: "14px", color: "var(--airbnb-muted)", marginTop: "20px" }}>
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            style={{ fontWeight: 600, color: "var(--airbnb-rausch)", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>

      <p style={{ marginTop: "32px", fontSize: "13px", color: "var(--airbnb-muted-soft)", textAlign: "center" }}>
        © 2026 NpuDen. All rights reserved.
      </p>
    </div>
  );
}

/* ── Small sub-components ────────────────────────────────── */

function Field({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--airbnb-muted)" }}>{label}</label>
        {aside}
      </div>
      {children}
    </div>
  );
}

function TextInput({
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      style={{
        height: "48px", padding: "0 14px",
        border: "1px solid var(--airbnb-hairline)",
        borderRadius: "var(--radius-sm)",
        fontSize: "16px", color: "var(--airbnb-ink)",
        background: "var(--airbnb-canvas)", outline: "none", width: "100%",
        transition: "border-color 0.15s ease",
        fontFamily: "inherit",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--airbnb-ink)")}
      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--airbnb-hairline)")}
    />
  );
}

function PrimaryButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        marginTop: "8px", height: "48px", width: "100%",
        background: loading ? "var(--airbnb-rausch-disabled)" : "var(--airbnb-rausch)",
        color: "white", border: "none", borderRadius: "var(--radius-sm)",
        fontSize: "16px", fontWeight: 500,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "background-color 0.15s ease, transform 0.1s ease",
        fontFamily: "inherit",
      }}
      onMouseDown={(e) => { if (!loading) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}
