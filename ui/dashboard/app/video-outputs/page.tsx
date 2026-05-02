"use client";

import React, { useCallback, useEffect, useState } from "react";
import { TopNav } from "../components/TopNav";
import type {
  MultiviewLayout,
  OutputAssignment,
  VideoOutputSlot,
  VideoOutputsDoc,
} from "../../lib/videoOutputsTypes";

const ASSIGN_KINDS: Array<{ value: OutputAssignment["kind"]; label: string }> = [
  { value: "program_bus", label: "PROGRAM bus (clean PGM)" },
  { value: "multiview_layout", label: "Multiview layout" },
  { value: "feed", label: "Feed (CAM slot)" },
  { value: "ndi_custom", label: "NDI source name (on network)" },
];

const FEEDS = [
  { id: "cam1", label: "CAM 1" },
  { id: "cam2", label: "CAM 2" },
  { id: "cam3", label: "CAM 3" },
];

function emptyAssignment(kind: OutputAssignment["kind"]): OutputAssignment {
  switch (kind) {
    case "program_bus":
      return { kind: "program_bus" };
    case "multiview_layout":
      return { kind: "multiview_layout", layoutId: "" };
    case "feed":
      return { kind: "feed", feedId: "cam1" };
    case "ndi_custom":
      return { kind: "ndi_custom", ndiName: "" };
    default:
      return { kind: "program_bus" };
  }
}

export default function VideoOutputsPage() {
  const [doc, setDoc] = useState<VideoOutputsDoc | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/video-outputs", { credentials: "include" });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error || "Load failed");
      return;
    }
    setDoc(j as VideoOutputsDoc);
    setMsg(null);
    const me = await fetch("/api/auth/me", { credentials: "include" });
    if (me.ok) {
      const u = (await me.json()) as { permissions?: string[] };
      setCanConfigure(Array.isArray(u.permissions) && u.permissions.includes("rack.configure"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!doc) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/video-outputs", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputs: doc.outputs, multiviewLayouts: doc.multiviewLayouts }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || "Save failed");
        return;
      }
      setDoc(j.doc as VideoOutputsDoc);
      setMsg("Saved — downstream NDI publisher should reload routing.");
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  };

  const updateOutput = (id: string, patch: Partial<VideoOutputSlot>) => {
    setDoc((d) => {
      if (!d) return d;
      return {
        ...d,
        outputs: d.outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      };
    });
  };

  const updateAssignment = (id: string, a: OutputAssignment) => {
    updateOutput(id, { assignment: a });
  };

  const updateLayout = (layoutId: string, next: MultiviewLayout) => {
    setDoc((d) => {
      if (!d) return d;
      return {
        ...d,
        multiviewLayouts: d.multiviewLayouts.map((L) => (L.id === layoutId ? next : L)),
      };
    });
  };

  if (!doc) {
    return (
      <main className="tactical-root">
        <TopNav />
        <p className="technical-label">Loading video output routing…</p>
      </main>
    );
  }

  return (
    <main className="tactical-root video-out-page">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">Video outputs &amp; NDI routing</h1>
          <p className="technical-label">
            Define Output A/B/C: PROGRAM bus, multiview layout, or a fixed CAM / custom NDI name. Set an{" "}
            <strong>NDI stream name</strong> for each slot — operators open that name in <strong>NDI Video Monitor</strong>; a
            future <code className="mono">junction-output-router</code> publishes PGM/MV/composites to those names.
          </p>
        </header>

        <article className="diag-card video-out-hint">
          <h2 className="pane-title">How this ties to NDI Video Monitor</h2>
          <ul className="video-out-list">
            <li>
              <strong>Program</strong> output → subscribe to e.g. <code className="mono">JUNCTION-PGM</code> once your publisher
              maps the live PROGRAM bus there.
            </li>
            <li>
              <strong>Multiview</strong> → subscribe to e.g. <code className="mono">JUNCTION-MV</code> for the tiled wall on your
              main display.
            </li>
            <li>
              <strong>NDI custom</strong> → Monitor connects directly to an existing source on the LAN (no Junction publisher
              required).
            </li>
          </ul>
        </article>

        <article className="diag-card">
          <h2 className="pane-title">Multiview layouts</h2>
          <p className="technical-label">Tiles reference CAM feeds (cam1…cam3). The output-router compositor will use this.</p>
          {doc.multiviewLayouts.map((layout) => (
            <div key={layout.id} className="video-out-layout-block">
              <div className="video-out-layout-head">
                <label className="video-out-inline">
                  <span className="technical-label">Label</span>
                  <input
                    className="sc-input"
                    value={layout.label}
                    disabled={!canConfigure}
                    onChange={(e) =>
                      updateLayout(layout.id, {
                        ...layout,
                        label: e.target.value,
                      })
                    }
                  />
                </label>
                <span className="mono technical-label">id: {layout.id}</span>
              </div>
              <div className="video-out-tiles">
                {layout.tiles
                  .slice()
                  .sort((a, b) => a.slot - b.slot)
                  .map((t) => (
                    <label key={`${layout.id}-${t.slot}`} className="video-out-tile-field">
                      <span className="technical-label">
                        Slot {t.slot + 1}
                      </span>
                      <select
                        className="rack-select"
                        disabled={!canConfigure}
                        value={t.feedId}
                        onChange={(e) => {
                          const feedId = e.target.value;
                          const tiles = layout.tiles.map((x) =>
                            x.slot === t.slot ? { ...x, feedId } : x
                          );
                          updateLayout(layout.id, { ...layout, tiles });
                        }}
                      >
                        {FEEDS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </article>

        <article className="diag-card">
          <h2 className="pane-title">Output slots</h2>
          <div className="video-out-grid">
            {doc.outputs.map((o) => (
              <div key={o.id} className="video-out-slot tactile-node">
                <header className="video-out-slot-head">
                  <label>
                    <span className="technical-label">Label</span>
                    <input
                      className="sc-input"
                      disabled={!canConfigure}
                      value={o.label}
                      onChange={(e) => updateOutput(o.id, { label: e.target.value })}
                    />
                  </label>
                  <label className="video-out-enable">
                    <input
                      type="checkbox"
                      checked={o.enabled}
                      disabled={!canConfigure}
                      onChange={(e) => updateOutput(o.id, { enabled: e.target.checked })}
                    />
                    <span className="technical-label">Enabled</span>
                  </label>
                </header>

                <label>
                  <span className="technical-label">NDI stream name (Monitor / publisher)</span>
                  <input
                    className="sc-input mono"
                    disabled={!canConfigure}
                    value={o.ndiStreamName}
                    onChange={(e) => updateOutput(o.id, { ndiStreamName: e.target.value })}
                  />
                </label>

                <label>
                  <span className="technical-label">Assignment</span>
                  <select
                    className="rack-select"
                    disabled={!canConfigure}
                    value={o.assignment.kind}
                    onChange={(e) => {
                      const kind = e.target.value as OutputAssignment["kind"];
                      updateAssignment(o.id, emptyAssignment(kind));
                    }}
                  >
                    {ASSIGN_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>

                {o.assignment.kind === "multiview_layout" ? (
                  <label>
                    <span className="technical-label">Layout</span>
                    <select
                      className="rack-select"
                      disabled={!canConfigure}
                      value={o.assignment.layoutId}
                      onChange={(e) =>
                        updateAssignment(o.id, {
                          kind: "multiview_layout",
                          layoutId: e.target.value,
                        })
                      }
                    >
                      <option value="">— select —</option>
                      {doc.multiviewLayouts.map((L) => (
                        <option key={L.id} value={L.id}>
                          {L.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {o.assignment.kind === "feed" ? (
                  <label>
                    <span className="technical-label">CAM feed</span>
                    <select
                      className="rack-select"
                      disabled={!canConfigure}
                      value={o.assignment.feedId}
                      onChange={(e) =>
                        updateAssignment(o.id, {
                          kind: "feed",
                          feedId: e.target.value,
                        })
                      }
                    >
                      {FEEDS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {o.assignment.kind === "ndi_custom" ? (
                  <label>
                    <span className="technical-label">NDI source name</span>
                    <input
                      className="sc-input mono"
                      disabled={!canConfigure}
                      value={o.assignment.ndiName}
                      onChange={(e) =>
                        updateAssignment(o.id, {
                          kind: "ndi_custom",
                          ndiName: e.target.value,
                        })
                      }
                    />
                  </label>
                ) : null}

                <label>
                  <span className="technical-label">Notes</span>
                  <textarea
                    className="sc-input"
                    disabled={!canConfigure}
                    rows={2}
                    value={o.notes || ""}
                    onChange={(e) => updateOutput(o.id, { notes: e.target.value })}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="fiber-actions video-out-actions">
            <button type="button" className="rack-save-btn" disabled={busy || !canConfigure} onClick={() => void save()}>
              {busy ? "Saving…" : "Save routing"}
            </button>
            <button type="button" className="rack-save-btn" onClick={() => void load()}>
              Reload
            </button>
          </div>
          {msg ? <p className="remap-status mono">{msg}</p> : null}
          {!canConfigure ? (
            <p className="technical-label">Sign in as a role with rack configure permission to edit.</p>
          ) : null}
        </article>
      </section>
    </main>
  );
}
