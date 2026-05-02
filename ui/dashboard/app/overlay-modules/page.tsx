"use client";

import { TopNav } from "../components/TopNav";
import { useEffect, useState } from "react";

type OverlayModule = {
  id: string;
  nodeId: string;
  label: string;
  engine: "obs_gfx" | "ffmpeg_drawtext" | "custom";
  output: "program_fill_key" | "program_burnin" | "aux_clean" | "stream_overlay";
  sceneProfile: string;
  enabled: boolean;
  state: "online" | "offline" | "maintenance";
  lastHeartbeatAt: string | null;
  notes: string;
};

type OverlayDoc = {
  modules: OverlayModule[];
  policy: { mode: "orange_pi_overlay_module"; syncFromRealtimeEvents: boolean };
};

export default function OverlayModulesPage() {
  const [doc, setDoc] = useState<OverlayDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/overlay-modules", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Failed to load");
      return;
    }
    setDoc(data as OverlayDoc);
    setMsg(null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!doc) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/overlay-modules", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Save failed");
      else {
        setDoc(data as OverlayDoc);
        setMsg("Overlay module config saved");
      }
    } catch {
      setMsg("Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return (
      <main className="tactical-root gm-page">
        <TopNav />
        <p className="gm-loading">{msg || "Loading overlay modules..."}</p>
      </main>
    );
  }

  return (
    <main className="tactical-root gm-page">
      <TopNav />
      <section className="gm-shell tactile-node">
        <header className="gm-header">
          <h1 className="pane-title">Graphics / overlay modules</h1>
          <p className="gm-lede">
            Dedicated graphics plane for modular engines on your rack. Operators drive on-air text and layers from the{" "}
            <a href="/graphics">Graphics</a> desk (preview/program buses); this page is inventory and routing targets.
          </p>
          <div className="gm-actions">
            <button className="gm-btn" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
            <button className="gm-btn gm-btn--accent" disabled={busy} onClick={() => void save()}>
              Save overlay config
            </button>
            <a className="gm-btn gm-btn--link" href="/gpu-modules">
              GPU modules
            </a>
          </div>
          {msg ? <p className="gm-msg">{msg}</p> : null}
        </header>

        <section className="gm-panel">
          <h2 className="technical-label">Policy</h2>
          <label className="gm-check">
            <input
              type="checkbox"
              checked={doc.policy.syncFromRealtimeEvents}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  policy: { ...doc.policy, syncFromRealtimeEvents: e.target.checked },
                })
              }
            />
            <span>Sync overlay automation from realtime event bus (`/api/realtime/events`)</span>
          </label>
        </section>

        <section className="gm-panel">
          <h2 className="technical-label">Modules</h2>
          <div className="gm-table-wrap">
            <table className="gm-table">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Node</th>
                  <th>Engine</th>
                  <th>Output</th>
                  <th>Profile</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {doc.modules.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{m.nodeId}</td>
                    <td>{m.engine}</td>
                    <td>{m.output}</td>
                    <td>{m.sceneProfile}</td>
                    <td>
                      <label className="gm-inline">
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          onChange={(e) =>
                            setDoc({
                              ...doc,
                              modules: doc.modules.map((x) => (x.id === m.id ? { ...x, enabled: e.target.checked } : x)),
                            })
                          }
                        />
                        <span>enabled</span>
                      </label>
                      <select
                        className="gm-input gm-input--small"
                        value={m.state}
                        onChange={(e) =>
                          setDoc({
                            ...doc,
                            modules: doc.modules.map((x) =>
                              x.id === m.id ? { ...x, state: e.target.value as OverlayModule["state"] } : x
                            ),
                          })
                        }
                      >
                        <option value="online">online</option>
                        <option value="offline">offline</option>
                        <option value="maintenance">maintenance</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
