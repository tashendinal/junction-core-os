"use client";

import { TopNav } from "../components/TopNav";
import React, { useCallback, useEffect, useState } from "react";
import {
  getServerConfig,
  getServerHealth,
  getServerObservability,
  orchestrateServerService,
  probeServerServices,
  putServerConfig,
  type ServerConfigDto,
  type ServerHealthDto,
  type ObservabilityEventDto,
} from "../../lib/controlApi";

export default function ServerControlPage() {
  const [health, setHealth] = useState<ServerHealthDto | null>(null);
  const [config, setConfig] = useState<ServerConfigDto | null>(null);
  const [obsExtra, setObsExtra] = useState<ObservabilityEventDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [visionUrlInput, setVisionUrlInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [standbyDashInput, setStandbyDashInput] = useState("");
  const [standbyVisionInput, setStandbyVisionInput] = useState("");
  const [standbyProcInput, setStandbyProcInput] = useState("");
  const [remoteAccessMode, setRemoteAccessMode] = useState<"lan_only" | "secure_remote">("lan_only");
  const [allowedCidrs, setAllowedCidrs] = useState("");
  const [requireRemoteCode, setRequireRemoteCode] = useState(false);
  const [operatorProfileMode, setOperatorProfileMode] = useState<
    "single_vendor_operator" | "multi_vendor_software_defined"
  >("multi_vendor_software_defined");
  const [singleVendorProfile, setSingleVendorProfile] = useState<"sony_stack" | "blackmagic_style" | "custom" | "">(
    ""
  );
  const [nodeOverride, setNodeOverride] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [h, c, o] = await Promise.all([
        getServerHealth(),
        getServerConfig(),
        getServerObservability(40),
      ]);
      setHealth(h);
      if (c) {
        setConfig(c);
        setVisionUrlInput(c.visionHttpUrl ?? "");
        setNotesInput(c.notes ?? "");
        setStandbyDashInput(c.standbyDashboardUrl ?? "");
        setStandbyVisionInput(c.standbyVisionHttpUrl ?? "");
        setStandbyProcInput(c.standbyProcedureNotes ?? "");
        setRemoteAccessMode(c.remoteAccessMode ?? "lan_only");
        setAllowedCidrs((c.allowedLoginCidrs || []).join(","));
        setRequireRemoteCode(Boolean(c.requireRemoteCode));
        setOperatorProfileMode(c.operatorProfileMode ?? "multi_vendor_software_defined");
        setSingleVendorProfile(c.singleVendorProfile ?? "");
      }
      setObsExtra(o);
    } catch {
      setMsg("Failed to load server snapshot");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await putServerConfig({
          visionHttpUrl: visionUrlInput.trim() || null,
          notes: notesInput,
          standbyDashboardUrl: standbyDashInput.trim() || null,
          standbyVisionHttpUrl: standbyVisionInput.trim() || null,
          standbyProcedureNotes: standbyProcInput.trim() || null,
          remoteAccessMode,
          allowedLoginCidrs: allowedCidrs
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          requireRemoteCode,
          operatorProfileMode,
          singleVendorProfile:
            operatorProfileMode === "single_vendor_operator" ? singleVendorProfile || "custom" : null,
      });
      setMsg("Config saved");
      void load();
    } catch {
      setMsg("Save failed");
    } finally {
      setBusy(false);
    }
  };

  const probeService = async (serviceId?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await probeServerServices(serviceId);
      setMsg(serviceId ? `Probed ${serviceId}` : "Probed all services");
      void load();
    } catch {
      setMsg("Probe failed");
    } finally {
      setBusy(false);
    }
  };

  const orchestrate = async (serviceId: string, defaultNodeId: string | null) => {
    setBusy(true);
    setMsg(null);
    const nodeId = (nodeOverride[serviceId] || defaultNodeId || "").trim();
    if (!nodeId) {
      setMsg("Set a target node id for orchestration");
      setBusy(false);
      return;
    }
    try {
      const data = await orchestrateServerService(serviceId, nodeId);
      setMsg(`Queued: ${data.command?.action} → ${nodeId}`);
      void load();
    } catch {
      setMsg("Orchestration failed");
    } finally {
      setBusy(false);
    }
  };

  const events = obsExtra.length ? obsExtra : health?.observability || [];

  return (
    <main className="tactical-root sc-page">
      <TopNav />
      <div className="sc-shell tactile-node">
        <header className="sc-header">
          <h1 className="pane-title">Server control</h1>
          <p className="sc-lede">
            Cluster snapshot, HTTP probes, vision orchestration via node-agent (requires{" "}
            <code className="sc-code">JUNCTION_ENABLE_COMMAND_EXECUTION</code> on nodes), and operator config. Dangerous
            actions require <strong>server.maintenance</strong> / <strong>rack.configure</strong>.
          </p>
          <div className="sc-toolbar">
            <button type="button" className="sc-btn" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
            <button type="button" className="sc-btn sc-btn--accent" disabled={busy} onClick={() => void probeService()}>
              Probe all services
            </button>
            {msg ? <span className="sc-msg">{msg}</span> : null}
          </div>
        </header>

        {health ? (
          <section className="sc-cards">
            <div className={`sc-card ${health.vision.ok ? "sc-card--ok" : "sc-card--warn"}`}>
              <h3>Vision</h3>
              <p className="sc-card-metric">{health.vision.ok ? "Reachable" : "Issue"}</p>
              <p className="sc-card-detail">{health.vision.detail}</p>
              <p className="sc-card-mono">{health.vision.baseUrl}</p>
            </div>
            <div className="sc-card">
              <h3>Nodes</h3>
              <p className="sc-card-metric">{health.nodes.count} reporting</p>
              <p className="sc-card-detail">{health.nodes.staleCount} stale telemetry</p>
            </div>
            <div className="sc-card">
              <h3>Commands</h3>
              <p className="sc-card-metric">{health.commands.queued} queued</p>
              <p className="sc-card-detail">Agents poll <code className="sc-code">/api/node-commands?agent=1</code></p>
            </div>
            <div className={`sc-card ${(health.gpu?.enabled || 0) > 0 ? "sc-card--ok" : ""}`}>
              <h3>GPU modules</h3>
              <p className="sc-card-metric">
                {health.gpu?.online ?? 0}/{health.gpu?.enabled ?? 0} online
              </p>
              <p className="sc-card-detail">
                NVIDIA: {health.gpu?.nvidia ?? 0} · L4: {health.gpu?.l4 ?? 0}
              </p>
            </div>
          </section>
        ) : null}

        <section className="sc-panel">
          <h2 className="technical-label">Operator profile</h2>
          <p className="sc-hint">
            Active dashboard style for operators. Use <strong>Single-vendor operator</strong> for simplified workflows, or{" "}
            <strong>Multi-vendor software-defined</strong> for advanced/custom deployments.
          </p>
          <label className="sc-field">
            <span>Profile mode</span>
            <select
              className="sc-input"
              value={operatorProfileMode}
              onChange={(e) =>
                setOperatorProfileMode(
                  e.target.value as "single_vendor_operator" | "multi_vendor_software_defined"
                )
              }
            >
              <option value="single_vendor_operator">Single-vendor operator</option>
              <option value="multi_vendor_software_defined">Multi-vendor software-defined</option>
            </select>
          </label>
          {operatorProfileMode === "single_vendor_operator" ? (
            <label className="sc-field">
              <span>Single-vendor profile</span>
              <select
                className="sc-input"
                value={singleVendorProfile}
                onChange={(e) => setSingleVendorProfile(e.target.value as "sony_stack" | "blackmagic_style" | "custom")}
              >
                <option value="sony_stack">Sony stack</option>
                <option value="blackmagic_style">Blackmagic style</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          ) : null}
          <button type="button" className="sc-btn sc-btn--accent" disabled={busy} onClick={() => void saveConfig()}>
            Save profile mode
          </button>
        </section>

        <section className="sc-panel">
          <h2 className="technical-label">Logical services</h2>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Probe target</th>
                  <th>Last probe</th>
                  <th>Node</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {health?.services.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td className="sc-mono sc-ellipsis" title={s.resolvedProbeUrl || ""}>
                      {s.resolvedProbeUrl || "—"}
                    </td>
                    <td>
                      {s.lastProbe ? (
                        <span className={s.lastProbe.ok ? "sc-ok" : "sc-bad"}>
                          {s.lastProbe.ok ? "OK" : "FAIL"} · {new Date(s.lastProbe.at).toLocaleString()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <input
                        className="sc-input"
                        placeholder={s.defaultNodeId || "node id"}
                        value={nodeOverride[s.id] ?? ""}
                        onChange={(e) => setNodeOverride((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        aria-label={`Node override ${s.id}`}
                      />
                    </td>
                    <td className="sc-actions">
                      <button type="button" className="sc-btn sc-btn--sm" disabled={busy} onClick={() => void probeService(s.id)}>
                        Probe
                      </button>
                      {s.orchestrateAction ? (
                        <button
                          type="button"
                          className="sc-btn sc-btn--sm sc-btn--warn"
                          disabled={busy}
                          onClick={() => void orchestrate(s.id, s.defaultNodeId)}
                        >
                          {s.orchestrateAction}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sc-panel">
          <h2 className="technical-label">Site config</h2>
          <p className="sc-hint">Overrides <code className="sc-code">VISION_HTTP_URL</code> for readiness, vision proxy, and probes when set.</p>
          <label className="sc-field">
            <span>Vision HTTP base</span>
            <input
              className="sc-input"
              value={visionUrlInput}
              onChange={(e) => setVisionUrlInput(e.target.value)}
              placeholder="http://10.0.0.12:9000"
            />
          </label>
          <label className="sc-field">
            <span>Operator notes</span>
            <textarea className="sc-textarea" rows={3} value={notesInput} onChange={(e) => setNotesInput(e.target.value)} />
          </label>

          <h3 className="technical-label" style={{ marginTop: "16px" }}>
            Warm standby (carbon-copy control plane)
          </h3>
          <p className="sc-hint">
            Keep a <strong>second</strong> Junction dashboard (and optional Vision) offline or warm. Only <strong>one</strong>{" "}
            control plane should command live routing at a time. Use backup bundle +{" "}
            <code className="sc-code">docs/runbook-standby.md</code> to sync config. Bookmarks below are non-secret hints for
            operators.
          </p>
          <label className="sc-field">
            <span>Standby dashboard URL</span>
            <input
              className="sc-input"
              value={standbyDashInput}
              onChange={(e) => setStandbyDashInput(e.target.value)}
              placeholder="https://standby-junction.lan:3000"
            />
          </label>
          <label className="sc-field">
            <span>Standby Vision HTTP base (optional)</span>
            <input
              className="sc-input"
              value={standbyVisionInput}
              onChange={(e) => setStandbyVisionInput(e.target.value)}
              placeholder="http://10.0.0.2:9000"
            />
          </label>
          <label className="sc-field">
            <span>Standby / DR procedure notes</span>
            <textarea
              className="sc-textarea"
              rows={2}
              value={standbyProcInput}
              onChange={(e) => setStandbyProcInput(e.target.value)}
              placeholder="e.g. Runbook in wiki / who promotes / last drill 2026-04-01"
            />
          </label>
          {standbyDashInput.trim() || config?.standbyDashboardUrl ? (
            <p className="sc-hint">
              Open standby:{" "}
              <a
                href={(standbyDashInput.trim() || config?.standbyDashboardUrl) as string}
                target="_blank"
                rel="noreferrer"
              >
                {standbyDashInput.trim() || config?.standbyDashboardUrl}
              </a>
            </p>
          ) : null}
          <h3 className="technical-label" style={{ marginTop: "16px" }}>
            Login IP policy and remote access
          </h3>
          <label className="sc-field">
            <span>Remote access mode</span>
            <select
              className="sc-input"
              value={remoteAccessMode}
              onChange={(e) => setRemoteAccessMode(e.target.value as "lan_only" | "secure_remote")}
            >
              <option value="lan_only">lan_only</option>
              <option value="secure_remote">secure_remote</option>
            </select>
          </label>
          <label className="sc-field">
            <span>Allowed login CIDRs (csv)</span>
            <input
              className="sc-input"
              value={allowedCidrs}
              onChange={(e) => setAllowedCidrs(e.target.value)}
              placeholder="10.0.0.0/8,192.168.0.0/16"
            />
          </label>
          <p className="sc-hint">
            Non-empty list: only IPs in these ranges can sign in or use password reset (set{" "}
            <span className="sc-mono">X-Forwarded-For</span> or <span className="sc-mono">X-Real-IP</span> on your
            reverse proxy). Applies in <span className="sc-mono">lan_only</span> and{" "}
            <span className="sc-mono">secure_remote</span>. Clear the field for <span className="sc-mono">lan_only</span>{" "}
            to allow any IP. Narrow the list (e.g. office subnet, VPN CGNAT) to block guest Wi‑Fi phones. For local dev,
            include <span className="sc-mono">127.0.0.1/32</span>.
          </p>
          <label className="sc-field">
            <span>
              <input
                type="checkbox"
                checked={requireRemoteCode}
                onChange={(e) => setRequireRemoteCode(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Require remote login code (DASHBOARD_REMOTE_ACCESS_CODE)
            </span>
          </label>

          <button type="button" className="sc-btn sc-btn--accent" disabled={busy} onClick={() => void saveConfig()}>
            Save config
          </button>
        </section>

        <section className="sc-panel">
          <h2 className="technical-label">Recent control events</h2>
          <ul className="sc-events">
            {events.map((ev, i) => (
              <li key={`${ev.at}-${i}`}>
                <span className="sc-mono">{ev.at}</span> <strong>{ev.type}</strong>{" "}
                <span className="sc-mono">{JSON.stringify(ev.detail)}</span>
              </li>
            ))}
          </ul>
        </section>

        {health?.commands.recentFailed?.length ? (
          <section className="sc-panel sc-panel--alert">
            <h2 className="technical-label">Recent failed node commands</h2>
            <ul className="sc-events">
              {health.commands.recentFailed.map((c) => (
                <li key={c.id}>
                  {c.nodeId} · {c.action} · {c.result || "—"}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="sc-footer">
          On-air checklist: <a href="/on-air">/on-air</a> · Rack: <a href="/server-rack">/server-rack</a> · Record:{" "}
          <a href="/recording-rack">/recording-rack</a> · GPU: <a href="/gpu-modules">/gpu-modules</a> · NOC:{" "}
          <a href="/noc">/noc</a>
        </p>
      </div>
    </main>
  );
}
