"use client";

import { TopNav } from "../components/TopNav";
import { useEffect, useState } from "react";

type Check = {
  id: string;
  label: string;
  severity: "critical" | "warning" | "info";
  status: "ok" | "warn" | "fail";
  detail: string;
};

type Payload = {
  generatedAt: string;
  overall: "ok" | "warning" | "critical";
  checks: Check[];
  mcrNote: string;
};

export default function McrPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [msg, setMsg] = useState<string>("");

  const load = async () => {
    const res = await fetch("/api/mcr/quality", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Failed to load MCR quality");
      return;
    }
    setPayload(data as Payload);
    setMsg("");
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, []);

  const checks = payload?.checks || [];

  return (
    <main className="tactical-root">
      <TopNav />
      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">MCR quality control</h1>
          <p className="technical-label">
            Monitoring + quality supervision for master control room operators. Live switching remains local authority.
          </p>
        </header>

        <div className="fiber-grid">
          <article className="diag-card">
            <h2 className="pane-title">MCR overall</h2>
            <p className={`readiness-overall readiness-${payload?.overall === "critical" ? "fail" : payload?.overall === "warning" ? "warn" : "pass"}`}>
              Status: {(payload?.overall || "ok").toUpperCase()}
            </p>
            <p className="technical-label">{payload?.mcrNote || "Loading..."}</p>
            <p className="technical-label">
              Last update: {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString() : "—"}
            </p>
          </article>

          <article className="diag-card">
            <h2 className="pane-title">Operator actions</h2>
            <div className="fiber-actions">
              <button className="rack-save-btn" onClick={() => void load()}>
                Refresh
              </button>
              <button className="rack-save-btn" onClick={() => window.open("/server-control", "_self")}>
                Open server control
              </button>
              <button className="rack-save-btn" onClick={() => window.open("/readiness", "_self")}>
                Open readiness
              </button>
              <button className="rack-save-btn" onClick={() => window.open("/recording-rack", "_self")}>
                Open recording rack
              </button>
            </div>
            {msg ? <p className="remap-status mono">{msg}</p> : null}
          </article>
        </div>

        <article className="diag-card">
          <h2 className="pane-title">QC checks</h2>
          <div className="noc-alerts">
            {checks.map((c) => (
              <div key={c.id} className={`noc-alert noc-alert-${c.severity === "info" ? "info" : c.severity}`}>
                <strong>{c.label}</strong>
                <span>{c.detail}</span>
                <small>{c.status.toUpperCase()}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
