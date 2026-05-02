"use client";

import { TopNav } from "../components/TopNav";
import { useCallback, useEffect, useMemo, useState } from "react";

type RecordingModule = {
  id: string;
  kind: "playback_deck" | "iso_recorder";
  label: string;
  rackU: number;
  heightU: number;
  primaryNodeId: string;
  backupNodeId: string | null;
  primaryRecorderBase: string | null;
  backupRecorderBase: string | null;
  outputDir: string;
  inputNotes: string;
  enabled: boolean;
};

type SessionRow = {
  moduleId: string;
  tier: "primary" | "backup";
  state: string;
  lastError: string | null;
  startedAt: string | null;
};

type AgentHealthEntry = { ok: boolean; detail: string; body?: Record<string, unknown> };

type Payload = {
  rack: { modules: RecordingModule[] };
  sessions: { sessions: SessionRow[] };
  agentHealth?: Record<string, AgentHealthEntry>;
};

function normBase(b: string | null | undefined) {
  return (b || "").replace(/\/$/, "");
}

function sessionFor(modId: string, tier: "primary" | "backup", rows: SessionRow[]) {
  return rows.find((r) => r.moduleId === modId && r.tier === tier);
}

export default function RecordingRackPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isoProfile, setIsoProfile] = useState<"demo" | "prores_demo">("demo");

  const load = useCallback(async () => {
    const r = await fetch("/api/recording/sessions", { credentials: "include" });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error || "Load failed");
      return;
    }
    setData({
      rack: j.rack,
      sessions: j.sessions,
      agentHealth: j.agentHealth,
    });
    setMsg(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postSession = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/recording/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) setMsg(j.error || j.detail || "Action failed");
      else setMsg(j.success ? "OK" : null);
      await load();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  };

  const decks = useMemo(
    () => data?.rack.modules.filter((m) => m.kind === "playback_deck") || [],
    [data]
  );
  const isos = useMemo(
    () => data?.rack.modules.filter((m) => m.kind === "iso_recorder") || [],
    [data]
  );
  const rows = data?.sessions.sessions || [];
  const healthMap = data?.agentHealth || {};

  if (!data) {
    return (
      <main className="tactical-root">
        <TopNav />
        <p className="rr-loading">{msg || "Loading recording rack…"}</p>
      </main>
    );
  }

  return (
    <main className="tactical-root rr-page">
      <TopNav />
      <div className="rr-shell tactile-node">
        <header className="rr-header">
          <h1 className="pane-title">Recording rack</h1>
          <p className="rr-lede">
            <strong>HyperDeck-class</strong> slots (playback / ingest planning) and <strong>ISO recorders</strong> with{" "}
            <strong>primary + backup</strong> tiers. Each ISO channel talks to an <code className="rr-code">iso-recorder</code>{" "}
            agent (FFmpeg). Run one agent per node on port <strong>9011</strong>; set{" "}
            <code className="rr-code">primaryRecorderBase</code> / <code className="rr-code">backupRecorderBase</code> in{" "}
            <code className="rr-code">data/recording-rack.json</code> or via <strong>rack.configure</strong>. Profiles:{" "}
            <strong>demo</strong> (H.264 test pattern, <code className="rr-code">.mp4</code>) and{" "}
            <strong>prores_demo</strong> (ProRes HQ test pattern, <code className="rr-code">.mov</code>) — swap to{" "}
            <strong>custom</strong> via API for real NDI/SDI inputs. Agents enforce minimum free space via{" "}
            <code className="rr-code">JUNCTION_ISO_MIN_FREE_MB</code>.
          </p>
          <div className="rr-toolbar rr-toolbar--wrap">
            <label className="rr-profile-field">
              <span className="rr-profile-label">ISO profile</span>
              <select
                className="rr-select"
                value={isoProfile}
                onChange={(e) => setIsoProfile(e.target.value as "demo" | "prores_demo")}
              >
                <option value="demo">demo — H.264 test pattern (.mp4)</option>
                <option value="prores_demo">prores_demo — ProRes HQ test pattern (.mov)</option>
              </select>
            </label>
            <button type="button" className="rr-btn" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
            <a className="rr-btn rr-btn--link" href="/readiness">
              Readiness
            </a>
            <a className="rr-btn rr-btn--link" href="/server-control">
              Server control
            </a>
            <a className="rr-btn rr-btn--link" href="/on-air">
              On-air
            </a>
          </div>
          {msg ? <div className="rr-banner">{msg}</div> : null}
        </header>

        <section className="rr-section">
          <h2 className="rr-section-title">Playback decks (HyperDeck module)</h2>
          <div className="rr-grid">
            {decks.map((m) => (
              <article key={m.id} className="rr-card rr-card--deck">
                <div className="rr-card-head">
                  <span className="rr-badge rr-badge--deck">DECK</span>
                  <span className="rr-u">
                    U{m.rackU}
                    {m.heightU > 1 ? `–${m.rackU + m.heightU - 1}` : ""}
                  </span>
                </div>
                <h3>{m.label}</h3>
                <p className="rr-meta">
                  Primary node <strong>{m.primaryNodeId}</strong>
                  {m.backupNodeId ? (
                    <>
                      {" "}
                      · Backup <strong>{m.backupNodeId}</strong>
                    </>
                  ) : null}
                </p>
                <p className="rr-path">{m.outputDir}</p>
                <p className="rr-notes">{m.inputNotes}</p>
                <p className="rr-hint">
                  Wire physical HyperDeck or add a <strong>playback agent</strong> later; dashboard tracks{" "}
                  <strong>rack position</strong> and <strong>redundancy intent</strong> here.
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rr-section">
          <h2 className="rr-section-title">ISO channels (broadcast backup)</h2>
          <p className="rr-sub">
            <strong>Twin path</strong>: start <strong>primary</strong> on the main archive node and <strong>backup</strong> on a
            second node for parallel ISO — independent files, same timecode policy as your house sync. Agent{" "}
            <strong>GET /health</strong> is polled here and on <a href="/readiness">Readiness</a>.
          </p>
          <div className="rr-grid">
            {isos.map((m) => (
              <article key={m.id} className="rr-card rr-card--iso">
                <div className="rr-card-head">
                  <span className="rr-badge rr-badge--iso">ISO</span>
                  <span className="rr-u">
                    U{m.rackU}
                    {m.heightU > 1 ? `–${m.rackU + m.heightU - 1}` : ""}
                  </span>
                </div>
                <h3>{m.label}</h3>
                <p className="rr-meta">
                  Nodes <strong>{m.primaryNodeId}</strong>
                  {m.backupNodeId ? (
                    <>
                      {" "}
                      / <strong>{m.backupNodeId}</strong>
                    </>
                  ) : null}
                </p>
                <p className="rr-path">{m.outputDir}</p>
                <p className="rr-notes">{m.inputNotes}</p>

                <div className="rr-tiers">
                  {(["primary", "backup"] as const).map((tier) => {
                    const base = tier === "primary" ? m.primaryRecorderBase : m.backupRecorderBase;
                    const st = sessionFor(m.id, tier, rows);
                    const hk = normBase(base);
                    const ah = hk ? healthMap[hk] : undefined;
                    return (
                      <div key={tier} className="rr-tier">
                        <div className="rr-tier-head">
                          <strong>{tier}</strong>
                          <span className={`rr-state rr-state--${st?.state || "idle"}`}>{st?.state || "idle"}</span>
                        </div>
                        <code className="rr-code">{base || "—"}</code>
                        {ah ? (
                          <p className={ah.ok ? "rr-health rr-health--ok" : "rr-health rr-health--bad"}>
                            {ah.ok ? "Agent OK — " : "Agent issue — "}
                            {ah.detail}
                          </p>
                        ) : base ? (
                          <p className="rr-health rr-health--muted">No health cached for this base.</p>
                        ) : null}
                        {st?.lastError ? <p className="rr-err">{st.lastError}</p> : null}
                        <div className="rr-tier-actions">
                          <button
                            type="button"
                            className="rr-btn rr-btn--go"
                            disabled={busy || !m.enabled || !base}
                            onClick={() =>
                              void postSession({
                                action: "start",
                                moduleId: m.id,
                                tier,
                                profile: isoProfile,
                              })
                            }
                          >
                            Start ISO
                          </button>
                          <button
                            type="button"
                            className="rr-btn"
                            disabled={busy || !base}
                            onClick={() => void postSession({ action: "stop", moduleId: m.id, tier })}
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
