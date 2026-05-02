"use client";

import React, { useCallback, useEffect, useState } from "react";
import { TopNav } from "../components/TopNav";
import type { TallyControllerKind, TallyControllersDoc, TallyFeedId } from "../../lib/tallyControllersTypes";
import { TALLY_FEED_IDS } from "../../lib/tallyControllersTypes";

const FEED_LABELS: Record<TallyFeedId, string> = {
  cam1: "CAM 1",
  cam2: "CAM 2",
  cam3: "CAM 3",
};

const KIND_OPTIONS: Array<{ value: TallyControllerKind; label: string }> = [
  { value: "gpio_bridge", label: "GPIO bridge (SBC / rack)" },
  { value: "serial_uart", label: "Serial / UART tally" },
  { value: "http_webhook_sink", label: "HTTP sink (your service POST URL)" },
  { value: "companion_bitfocus", label: "Bitfocus Companion / Stream Deck" },
  { value: "third_party_box", label: "Third-party tally interface" },
  { value: "custom", label: "Custom" },
];

type TallyLive = {
  programId?: string;
  previewId?: string;
  tally?: Record<string, string>;
  revision?: number;
  error?: string;
};

function newControllerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `tc-${crypto.randomUUID()}`;
  return `tc-${Date.now()}`;
}

export default function TallyControllersPage() {
  const [doc, setDoc] = useState<TallyControllersDoc | null>(null);
  const [live, setLive] = useState<TallyLive | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);

  const loadDoc = useCallback(async () => {
    const r = await fetch("/api/tally-controllers", { credentials: "include" });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error || "Load failed");
      return;
    }
    setDoc(j as TallyControllersDoc);
    setMsg(null);
    const me = await fetch("/api/auth/me", { credentials: "include" });
    if (me.ok) {
      const u = (await me.json()) as { permissions?: string[] };
      setCanConfigure(Array.isArray(u.permissions) && u.permissions.includes("rack.configure"));
    }
  }, []);

  const pollTally = useCallback(async () => {
    const r = await fetch("/api/tally", { credentials: "include" });
    const j = (await r.json()) as TallyLive;
    if (r.ok) setLive(j);
    else setLive({ error: j.error || `HTTP ${r.status}` });
  }, []);

  useEffect(() => {
    void loadDoc();
  }, [loadDoc]);

  useEffect(() => {
    void pollTally();
    const t = window.setInterval(() => void pollTally(), 1500);
    return () => window.clearInterval(t);
  }, [pollTally]);

  const save = async () => {
    if (!doc) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/tally-controllers", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controllers: doc.controllers }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || "Save failed");
        return;
      }
      setDoc(j.doc as TallyControllersDoc);
      setMsg("Saved tally controller inventory.");
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (id: string, patch: Partial<TallyControllersDoc["controllers"][number]>) => {
    setDoc((d) => {
      if (!d) return d;
      return {
        ...d,
        controllers: d.controllers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      };
    });
  };

  const toggleFeed = (rowId: string, feedId: TallyFeedId, on: boolean) => {
    setDoc((d) => {
      if (!d) return d;
      return {
        ...d,
        controllers: d.controllers.map((c) => {
          if (c.id !== rowId) return c;
          const next = new Set(c.feedIds);
          if (on) next.add(feedId);
          else next.delete(feedId);
          const ordered = TALLY_FEED_IDS.filter((f) => next.has(f));
          return { ...c, feedIds: ordered };
        }),
      };
    });
  };

  const addRow = () => {
    setDoc((d) => {
      const base = d ?? { updatedAt: "", controllers: [] };
      return {
        ...base,
        controllers: [
          ...base.controllers,
          {
            id: newControllerId(),
            label: "New tally controller",
            enabled: true,
            kind: "gpio_bridge",
            endpoint: "",
            feedIds: [...TALLY_FEED_IDS],
          },
        ],
      };
    });
  };

  const removeRow = (id: string) => {
    setDoc((d) => {
      if (!d) return d;
      return { ...d, controllers: d.controllers.filter((c) => c.id !== id) };
    });
  };

  if (!doc) {
    return (
      <main className="tactical-root">
        <TopNav />
        <p className="technical-label">Loading tally controllers…</p>
      </main>
    );
  }

  return (
    <main className="tactical-root video-out-page">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">Tally controllers</h1>
          <p className="technical-label">
            Inventory of <strong>physical or software tally bridges</strong> (GPIO boxes, serial interfaces, Companion, etc.).
            Junction exposes live program/preview state via <code className="mono">GET /api/tally</code> — your bridge polls that
            endpoint (authenticated) or subscribes to Vision WebSocket on the LAN.
          </p>
        </header>

        <article className="diag-card">
          <h2 className="pane-title">Live switcher tally</h2>
          <p className="technical-label">Derived from Vision program/preview (same source as multiview ribbons).</p>
          <div className="tally-live-grid">
            {TALLY_FEED_IDS.map((fid) => {
              const state = live?.tally?.[fid] ?? "—";
              const isPgm = state === "program";
              const isPvw = state === "preview";
              return (
                <div
                  key={fid}
                  className={`tally-live-tile tactile-node ${isPgm ? "tally-live-pgm" : isPvw ? "tally-live-pvw" : ""}`}
                >
                  <strong>{FEED_LABELS[fid]}</strong>
                  <span className="mono technical-label">
                    {live?.error ? live.error : isPgm ? "PROGRAM" : isPvw ? "PREVIEW" : state === "idle" ? "idle" : state}
                  </span>
                </div>
              );
            })}
          </div>
          {live && !live.error ? (
            <p className="technical-label mono">
              programId={live.programId} previewId={live.previewId}
              {typeof live.revision === "number" ? ` revision=${live.revision}` : ""}
            </p>
          ) : null}
        </article>

        <article className="diag-card">
          <h2 className="pane-title">Controller inventory</h2>
          <p className="technical-label">
            Use this list for documentation and handoff. Junction does not push to these endpoints automatically yet — configure
            your device to pull <code className="mono">/api/tally</code> or Vision <code className="mono">/api/switcher</code>.
          </p>

          <div className="video-out-grid">
            {doc.controllers.map((c) => (
              <div key={c.id} className="video-out-slot tactile-node">
                <header className="video-out-slot-head">
                  <label>
                    <span className="technical-label">Label</span>
                    <input
                      className="sc-input"
                      disabled={!canConfigure}
                      value={c.label}
                      onChange={(e) => updateRow(c.id, { label: e.target.value })}
                    />
                  </label>
                  <label className="video-out-enable">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      disabled={!canConfigure}
                      onChange={(e) => updateRow(c.id, { enabled: e.target.checked })}
                    />
                    <span className="technical-label">In service</span>
                  </label>
                </header>

                <label>
                  <span className="technical-label">Kind</span>
                  <select
                    className="rack-select"
                    disabled={!canConfigure}
                    value={c.kind}
                    onChange={(e) => updateRow(c.id, { kind: e.target.value as TallyControllerKind })}
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="technical-label">Endpoint / device hint</span>
                  <input
                    className="sc-input mono"
                    disabled={!canConfigure}
                    placeholder="http://… or /dev/ttyUSB0"
                    value={c.endpoint}
                    onChange={(e) => updateRow(c.id, { endpoint: e.target.value })}
                  />
                </label>

                <div className="tally-feed-picks">
                  <span className="technical-label">Feeds</span>
                  <div className="tally-feed-picks-row">
                    {TALLY_FEED_IDS.map((fid) => (
                      <label key={`${c.id}-${fid}`} className="tally-feed-check">
                        <input
                          type="checkbox"
                          disabled={!canConfigure}
                          checked={c.feedIds.includes(fid)}
                          onChange={(e) => toggleFeed(c.id, fid, e.target.checked)}
                        />
                        {FEED_LABELS[fid]}
                      </label>
                    ))}
                  </div>
                </div>

                <label>
                  <span className="technical-label">Notes</span>
                  <textarea
                    className="sc-input"
                    disabled={!canConfigure}
                    rows={2}
                    value={c.notes || ""}
                    onChange={(e) => updateRow(c.id, { notes: e.target.value })}
                  />
                </label>

                <p className="mono technical-label">id: {c.id}</p>

                {canConfigure ? (
                  <button type="button" className="rack-save-btn tally-remove-btn" onClick={() => removeRow(c.id)}>
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="fiber-actions video-out-actions">
            {canConfigure ? (
              <button type="button" className="rack-save-btn" onClick={addRow}>
                Add controller
              </button>
            ) : null}
            <button type="button" className="rack-save-btn" disabled={busy || !canConfigure} onClick={() => void save()}>
              {busy ? "Saving…" : "Save inventory"}
            </button>
            <button type="button" className="rack-save-btn" onClick={() => void loadDoc()}>
              Reload
            </button>
          </div>
          {msg ? <p className="remap-status mono">{msg}</p> : null}
          {!canConfigure ? (
            <p className="technical-label">Sign in with rack configure permission to edit the inventory.</p>
          ) : null}
        </article>
      </section>
    </main>
  );
}
