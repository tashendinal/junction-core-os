"use client";

import { TopNav } from "../components/TopNav";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type ChecklistItem = { id: string; category: string; label: string; requiredForLive: boolean };
type ItemState = { checked: boolean; at?: string; by?: string; note?: string };

type Payload = {
  checklist: { items: ChecklistItem[] };
  session: { showLabel: string; mode: string; items: Record<string, ItemState> };
  progress: {
    requiredTotal: number;
    requiredChecked: number;
    allTotal: number;
    allChecked: number;
    canGoLive: boolean;
  };
};

export default function OnAirPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showInput, setShowInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/on-air", { credentials: "include" });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error || "Load failed");
      return;
    }
    setData(j as Payload);
    setShowInput((j as Payload).session.showLabel || "");
    setMsg(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/on-air", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || "Request failed");
        if (j.progress) setData((d) => (d ? { ...d, progress: j.progress } : null));
      } else {
        await load();
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    if (!data?.checklist?.items) return [];
    const m = new Map<string, ChecklistItem[]>();
    for (const it of data.checklist.items) {
      const list = m.get(it.category) || [];
      list.push(it);
      m.set(it.category, list);
    }
    return Array.from(m.entries());
  }, [data]);

  if (!data) {
    return (
      <main className="tactical-root">
        <TopNav />
        <p className="oa-loading">{msg || "Loading on-air console…"}</p>
      </main>
    );
  }

  const session = data.session;
  const progress = data.progress;

  return (
    <main className="tactical-root oa-page">
      <TopNav />
      <div className="oa-shell tactile-node">
        <header className="oa-header">
          <h1 className="pane-title">On-air readiness</h1>
          <p className="oa-lede">
            Portable OB or fixed studio: same preflight → rehearsal → LIVE gate. LIVE is blocked until all required
            items are checked. Pair with <a href="/readiness">Readiness</a> and{" "}
            <a href="/server-control">Server control</a>.
          </p>
        </header>

        <section className="oa-mode-bar">
          <div className="oa-modes">
            {(["preflight", "rehearsal", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`oa-mode ${session.mode === m ? "is-active" : ""} ${m === "live" ? "oa-mode--live" : ""}`}
                disabled={busy}
                onClick={() => void post({ action: "setMode", mode: m })}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="oa-show-field">
            <label>
              Show / site label
              <input
                value={showInput}
                onChange={(e) => setShowInput(e.target.value)}
                onBlur={() => void post({ action: "setShowLabel", showLabel: showInput })}
              />
            </label>
          </div>
          <button type="button" className="oa-btn oa-btn--ghost" disabled={busy} onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className="oa-btn oa-btn--danger"
            disabled={busy}
            onClick={() => {
              if (confirm("Reset on-air session (clears checks)?")) void post({ action: "reset" });
            }}
          >
            Reset session
          </button>
        </section>

        {progress ? (
          <div className="oa-progress">
            <div className="oa-progress-row">
              <span>Required for LIVE</span>
              <strong>
                {progress.requiredChecked} / {progress.requiredTotal}
              </strong>
            </div>
            <div className="oa-bar">
              <div
                className="oa-bar-fill"
                style={{
                  width: `${progress.requiredTotal ? (progress.requiredChecked / progress.requiredTotal) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="oa-progress-meta">
              All items: {progress.allChecked} / {progress.allTotal}
              {progress.canGoLive ? <span className="oa-ok"> · Cleared for LIVE</span> : null}
            </div>
          </div>
        ) : null}

        {msg ? <div className="oa-banner">{msg}</div> : null}

        <div className="oa-grid">
          {grouped.map(([category, items]) => (
            <section key={category} className="oa-cat">
              <h2 className="oa-cat-title">{category}</h2>
              <ul className="oa-list">
                {items.map((it) => {
                  const st = session.items[it.id];
                  const checked = st?.checked ?? false;
                  return (
                    <li key={it.id} className={`oa-item ${checked ? "is-done" : ""}`}>
                      <label className="oa-check-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => void post({ action: "toggle", itemId: it.id })}
                        />
                        <span>
                          {it.label}
                          {it.requiredForLive ? <span className="oa-req">Required</span> : null}
                        </span>
                      </label>
                      <textarea
                        className="oa-note"
                        placeholder="Note / waiver ref…"
                        rows={2}
                        defaultValue={st?.note || ""}
                        disabled={busy}
                        key={`${it.id}-${st?.note ?? ""}`}
                        onBlur={(e) => {
                          if ((st?.note || "") !== e.target.value) {
                            void post({ action: "setNote", itemId: it.id, note: e.target.value });
                          }
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
