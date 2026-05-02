"use client";

import { TopNav } from "../components/TopNav";
import { useEffect, useMemo, useState } from "react";

type GpuWorkflow =
  | "ndi_ingest_decode"
  | "iso_encode"
  | "contribution_encode"
  | "ai_qc"
  | "graphics_overlay";

type GpuModule = {
  id: string;
  nodeId: string;
  vendor: "nvidia" | "amd" | "intel" | "other";
  model: string;
  cardClass: "consumer" | "datacenter" | "special";
  vramGb: number;
  pcieSlot: string;
  driverVersion: string | null;
  cudaVersion: string | null;
  powerLimitW: number | null;
  enabled: boolean;
  state: "online" | "offline" | "maintenance";
  workflows: GpuWorkflow[];
  discoveredAt: string;
  lastSeenAt: string;
  notes: string;
};

type WorkflowPolicy = {
  mode: "orange_pi_control_gpu_media" | "gpu_only";
  orangePiControlNodeIds: string[];
  mediaNodeIds: string[];
  defaultCodecProfile: "low_latency" | "broadcast_quality" | "archive_mezzanine";
  autoEnrollFromTelemetry: boolean;
};

type Payload = {
  modules: GpuModule[];
  workflowPolicy: WorkflowPolicy;
  summary?: { total: number; enabled: number; online: number; nvidia: number; l4: number; mediaNodes: string[] };
};

const WORKFLOW_CHOICES: GpuWorkflow[] = [
  "ndi_ingest_decode",
  "iso_encode",
  "contribution_encode",
  "ai_qc",
  "graphics_overlay",
];

export default function GpuModulesPage() {
  const [doc, setDoc] = useState<Payload | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/gpu-modules", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Failed to load GPU modules");
      return;
    }
    setDoc(data as Payload);
    setMsg(null);
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = doc?.summary;
  const modules = doc?.modules || [];
  const policy = doc?.workflowPolicy;

  const hasL4 = useMemo(() => modules.some((m) => m.model.toLowerCase().includes("l4")), [modules]);

  const patchModule = (id: string, patch: Partial<GpuModule>) => {
    if (!doc) return;
    setDoc({
      ...doc,
      modules: doc.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };

  const toggleWorkflow = (id: string, wf: GpuWorkflow) => {
    if (!doc) return;
    const target = doc.modules.find((m) => m.id === id);
    if (!target) return;
    const exists = target.workflows.includes(wf);
    const workflows = exists ? target.workflows.filter((x) => x !== wf) : [...target.workflows, wf];
    patchModule(id, { workflows });
  };

  const save = async () => {
    if (!doc) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gpu-modules", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modules: doc.modules,
          workflowPolicy: doc.workflowPolicy,
        }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Save failed");
      else {
        setMsg("GPU module config saved");
        setDoc(data as Payload);
      }
    } catch {
      setMsg("Save failed");
    } finally {
      setBusy(false);
    }
  };

  const syncDiscovered = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gpu-modules", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync_discovered" }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Sync failed");
      else {
        setMsg(`Sync complete; added ${data.added || 0} module(s)`);
        setDoc(data as Payload);
      }
    } catch {
      setMsg("Sync failed");
    } finally {
      setBusy(false);
    }
  };

  if (!doc || !policy) {
    return (
      <main className="tactical-root gm-page">
        <TopNav />
        <p className="gm-loading">{msg || "Loading GPU modules..."}</p>
      </main>
    );
  }

  return (
    <main className="tactical-root gm-page">
      <TopNav />
      <section className="gm-shell tactile-node">
        <header className="gm-header">
          <h1 className="pane-title">GPU modules</h1>
          <p className="gm-lede">
            Plug-and-play GPU media plane for Junction: keep Orange Pi nodes as control/orchestration and bind heavy
            media workloads (NDI decode, ISO encode, contribution, AI/QC) to GPU nodes. Supports single or multiple
            cards, including NVIDIA datacenter cards like L4.
          </p>
          <div className="gm-actions">
            <button className="gm-btn" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
            <button className="gm-btn gm-btn--accent" disabled={busy} onClick={() => void syncDiscovered()}>
              Sync discovered GPUs
            </button>
            <button className="gm-btn gm-btn--accent" disabled={busy} onClick={() => void save()}>
              Save GPU config
            </button>
            <a className="gm-btn gm-btn--link" href="/server-control">
              Server control
            </a>
            <a className="gm-btn gm-btn--link" href="/readiness">
              Readiness
            </a>
          </div>
          {msg ? <p className="gm-msg">{msg}</p> : null}
        </header>

        <section className="gm-cards">
          <article className="gm-card">
            <h3>Modules</h3>
            <p className="gm-metric">{summary?.enabled ?? modules.length}</p>
            <p>{summary?.online ?? 0} online</p>
          </article>
          <article className="gm-card">
            <h3>NVIDIA</h3>
            <p className="gm-metric">{summary?.nvidia ?? 0}</p>
            <p>{summary?.l4 ?? 0} L4 class</p>
          </article>
          <article className="gm-card">
            <h3>Policy mode</h3>
            <p className="gm-metric mono">{policy.mode}</p>
            <p>Control nodes: {policy.orangePiControlNodeIds.join(", ") || "—"}</p>
          </article>
          <article className={`gm-card ${hasL4 ? "gm-card--ok" : ""}`}>
            <h3>Broadcast class GPU</h3>
            <p className="gm-metric">{hasL4 ? "YES" : "NO"}</p>
            <p>{hasL4 ? "L4 workflows enabled" : "Add L4/A2/A10 for higher density"}</p>
          </article>
        </section>

        <section className="gm-panel">
          <h2 className="technical-label">Orange Pi + GPU workflow policy</h2>
          <div className="gm-grid-2">
            <label className="gm-field">
              <span>Mode</span>
              <select
                className="gm-input"
                value={policy.mode}
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    workflowPolicy: { ...policy, mode: e.target.value as WorkflowPolicy["mode"] },
                  })
                }
              >
                <option value="orange_pi_control_gpu_media">orange_pi_control_gpu_media</option>
                <option value="gpu_only">gpu_only</option>
              </select>
            </label>
            <label className="gm-field">
              <span>Default codec profile</span>
              <select
                className="gm-input"
                value={policy.defaultCodecProfile}
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    workflowPolicy: { ...policy, defaultCodecProfile: e.target.value as WorkflowPolicy["defaultCodecProfile"] },
                  })
                }
              >
                <option value="low_latency">low_latency</option>
                <option value="broadcast_quality">broadcast_quality</option>
                <option value="archive_mezzanine">archive_mezzanine</option>
              </select>
            </label>
            <label className="gm-field">
              <span>Orange Pi control node IDs (csv)</span>
              <input
                className="gm-input"
                value={policy.orangePiControlNodeIds.join(",")}
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    workflowPolicy: {
                      ...policy,
                      orangePiControlNodeIds: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            <label className="gm-field">
              <span>Media node IDs (csv)</span>
              <input
                className="gm-input"
                value={policy.mediaNodeIds.join(",")}
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    workflowPolicy: {
                      ...policy,
                      mediaNodeIds: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
          </div>
          <label className="gm-check">
            <input
              type="checkbox"
              checked={policy.autoEnrollFromTelemetry}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  workflowPolicy: { ...policy, autoEnrollFromTelemetry: e.target.checked },
                })
              }
            />
            <span>Auto-enroll GPU modules from node telemetry when discovered</span>
          </label>
        </section>

        <section className="gm-panel">
          <h2 className="technical-label">GPU modules (plug and play)</h2>
          <div className="gm-table-wrap">
            <table className="gm-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Node</th>
                  <th>Model</th>
                  <th>State</th>
                  <th>Workflows</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="gm-stack">
                        <strong>{m.id}</strong>
                        <span className="mono">{m.vendor}</span>
                      </div>
                    </td>
                    <td>{m.nodeId}</td>
                    <td>
                      <div className="gm-stack">
                        <span>{m.model}</span>
                        <span className="mono">
                          {m.vramGb}GB · {m.pcieSlot} · {m.cardClass}
                        </span>
                      </div>
                    </td>
                    <td>
                      <label className="gm-inline">
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          onChange={(e) => patchModule(m.id, { enabled: e.target.checked })}
                        />
                        <span>enabled</span>
                      </label>
                      <select
                        className="gm-input gm-input--small"
                        value={m.state}
                        onChange={(e) =>
                          patchModule(m.id, { state: e.target.value as GpuModule["state"] })
                        }
                      >
                        <option value="online">online</option>
                        <option value="offline">offline</option>
                        <option value="maintenance">maintenance</option>
                      </select>
                    </td>
                    <td>
                      <div className="gm-chips">
                        {WORKFLOW_CHOICES.map((wf) => (
                          <button
                            key={`${m.id}-${wf}`}
                            className={`gm-chip ${m.workflows.includes(wf) ? "is-on" : ""}`}
                            onClick={() => toggleWorkflow(m.id, wf)}
                            type="button"
                          >
                            {wf}
                          </button>
                        ))}
                      </div>
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
