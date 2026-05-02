"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "../components/BrandMark";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remoteCode, setRemoteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "reset_request" | "reset_confirm">("login");
  const [resetUsername, setResetUsername] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");

  const nextPath = searchParams.get("next") || "/";
  const forbidden = searchParams.get("forbidden") === "1";

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          ...(remoteCode.trim() ? { remoteCode: remoteCode.trim() } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const onRequestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername }),
      });
      const data = (await res.json()) as { error?: string; message?: string; resetToken?: string };
      if (!res.ok) {
        setError(data.error || "Reset request failed");
        return;
      }
      setStatus(data.message || "Reset requested");
      if (data.resetToken) setResetToken(data.resetToken);
      setMode("reset_confirm");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = (await res.json()) as { error?: string; username?: string };
      if (!res.ok) {
        setError(data.error || "Password reset failed");
        return;
      }
      setStatus(`Password updated for ${data.username}. You can sign in now.`);
      setMode("login");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="login-card login-card-modern tactile-node">
      <div className="login-head">
        <BrandMark />
        <h1 className="pane-title">Operator access</h1>
        <p className="technical-label">Secure login with role-based controls.</p>
      </div>
      {forbidden ? <p className="login-error">Your role does not have access to that page.</p> : null}
      <div className="login-mode-tabs">
        <button className={`login-mode-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")} type="button">
          Sign in
        </button>
        <button
          className={`login-mode-btn ${mode === "reset_request" || mode === "reset_confirm" ? "active" : ""}`}
          onClick={() => setMode("reset_request")}
          type="button"
        >
          Reset password
        </button>
      </div>

      {mode === "login" ? (
        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span className="technical-label">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            <span className="technical-label">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            <span className="technical-label">Remote access code (optional)</span>
            <input
              type="password"
              autoComplete="off"
              value={remoteCode}
              onChange={(e) => setRemoteCode(e.target.value)}
              placeholder="Facility code — if remote login requires it"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : mode === "reset_request" ? (
        <form className="login-form" onSubmit={onRequestReset}>
          <label>
            <span className="technical-label">Account username</span>
            <input value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Generating..." : "Generate reset token"}
          </button>
        </form>
      ) : (
        <form className="login-form" onSubmit={onConfirmReset}>
          <label>
            <span className="technical-label">Reset token</span>
            <input value={resetToken} onChange={(e) => setResetToken(e.target.value)} required />
          </label>
          <label>
            <span className="technical-label">New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      )}

      {error ? <p className="login-error">{error}</p> : null}
      {status ? <p className="login-status">{status}</p> : null}
      <p className="technical-label login-footnote">
        Default users: admin / prod / viewer (configure env/users API in production).
      </p>
    </section>
  );
}

function LoginFallback() {
  return (
    <section className="login-card login-card-modern tactile-node" aria-busy="true">
      <div className="login-head">
        <BrandMark />
        <h1 className="pane-title">Operator access</h1>
        <p className="technical-label">Loading…</p>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="login-shell">
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
