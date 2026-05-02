"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useMemo, useState } from "react";

type FiberConfig = {
  provider: string;
  pathLabel: string;
  remoteSite: string;
  localSite: string;
  primaryIp: string;
  backupIp: string;
  vlanId: number;
  mtu: number;
  encryption: boolean;
};

type Permission = "rack.view" | "server.remote_access" | "server.network_storage";

const BASE_CONFIG: FiberConfig = {
  provider: "SLT Fiber",
  pathLabel: "Kandy OB Bus -> Colombo Control",
  remoteSite: "Kandy",
  localSite: "Colombo",
  primaryIp: "10.20.0.1",
  backupIp: "10.20.0.2",
  vlanId: 200,
  mtu: 1500,
  encryption: true,
};

export default function FiberLinkPage() {
  const [config, setConfig] = useState<FiberConfig>(BASE_CONFIG);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [latency, setLatency] = useState(8.7);
  const [jitter, setJitter] = useState(0.9);
  const [packetLoss, setPacketLoss] = useState(0.04);
  const [status, setStatus] = useState("Connected on primary SLT fiber path.");

  const can = (perm: Permission) => permissions.has(perm);
  const canControl = useMemo(() => can("server.remote_access") || can("server.network_storage"), [permissions]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetch("/api/auth/me");
      if (me.ok) {
        const data = (await me.json()) as { permissions?: Permission[] };
        if (!cancelled) setPermissions(new Set(data.permissions || []));
      }
      const res = await fetch("/api/fiber-link");
      if (res.ok) {
        const data = (await res.json()) as { config?: FiberConfig };
        if (!cancelled && data.config) setConfig(data.config);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setLatency((prev) => clamp(prev + (Math.random() - 0.5) * 0.8, 4, 28));
      setJitter((prev) => clamp(prev + (Math.random() - 0.5) * 0.25, 0.1, 4));
      setPacketLoss((prev) => clamp(prev + (Math.random() - 0.5) * 0.03, 0, 2.5));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const writeAudit = async (action: string, details: Record<string, unknown>) => {
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, target: "fiber-link", details }),
    });
  };

  const saveConfig = async () => {
    if (!can("server.network_storage")) return;
    const res = await fetch("/api/fiber-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) setStatus("Fiber profile saved successfully.");
    else setStatus("Save failed. Check role permissions.");
  };

  const runRemoteControl = async () => {
    if (!canControl) return;
    setStatus("Remote secure control tunnel opened between Colombo and Kandy.");
    await writeAudit("fiber.remote_control.start", {
      distance_km: 200,
      remote_site: config.remoteSite,
      local_site: config.localSite,
      provider: config.provider,
    });
  };

  const forceFailover = async () => {
    if (!can("server.network_storage")) return;
    setStatus(`Failover triggered to backup gateway ${config.backupIp}.`);
    await writeAudit("fiber.failover.force", {
      primary: config.primaryIp,
      backup: config.backupIp,
    });
  };

  return (
    <main className="tactical-root">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">SLT Fiber Remote Control (200km)</h1>
          <p className="technical-label">Operate servers in Kandy from Colombo over secured fiber transport.</p>
        </header>

        <div className="fiber-grid">
          <article className="diag-card">
            <h2 className="pane-title">Fiber Profile</h2>
            <div className="fiber-form">
              <label><span className="technical-label">Provider</span><input value={config.provider} onChange={(e) => setConfig((p) => ({ ...p, provider: e.target.value }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">Path Label</span><input value={config.pathLabel} onChange={(e) => setConfig((p) => ({ ...p, pathLabel: e.target.value }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">Remote Site</span><input value={config.remoteSite} onChange={(e) => setConfig((p) => ({ ...p, remoteSite: e.target.value }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">Control Site</span><input value={config.localSite} onChange={(e) => setConfig((p) => ({ ...p, localSite: e.target.value }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">Primary Gateway</span><input value={config.primaryIp} onChange={(e) => setConfig((p) => ({ ...p, primaryIp: e.target.value }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">Backup Gateway</span><input value={config.backupIp} onChange={(e) => setConfig((p) => ({ ...p, backupIp: e.target.value }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">VLAN</span><input type="number" value={config.vlanId} onChange={(e) => setConfig((p) => ({ ...p, vlanId: Number(e.target.value) }))} disabled={!can("server.network_storage")} /></label>
              <label><span className="technical-label">MTU</span><input type="number" value={config.mtu} onChange={(e) => setConfig((p) => ({ ...p, mtu: Number(e.target.value) }))} disabled={!can("server.network_storage")} /></label>
              <label className="fiber-checkbox"><input type="checkbox" checked={config.encryption} onChange={(e) => setConfig((p) => ({ ...p, encryption: e.target.checked }))} disabled={!can("server.network_storage")} /> Link encryption enabled</label>
            </div>
            <div className="fiber-actions">
              <button className="rack-save-btn" onClick={saveConfig} disabled={!can("server.network_storage")}>Save fiber profile</button>
              <button className="rack-save-btn" onClick={() => void runRemoteControl()} disabled={!canControl}>Start remote control</button>
              <button className="rack-save-btn" onClick={() => void forceFailover()} disabled={!can("server.network_storage")}>Force failover</button>
            </div>
          </article>

          <article className="diag-card">
            <h2 className="pane-title">Link Telemetry</h2>
            <div className="kv-list">
              <div><span>Distance</span><strong>~200 km</strong></div>
              <div><span>Latency</span><strong>{latency.toFixed(1)} ms</strong></div>
              <div><span>Jitter</span><strong>{jitter.toFixed(2)} ms</strong></div>
              <div><span>Packet Loss</span><strong>{packetLoss.toFixed(2)}%</strong></div>
              <div><span>Transport</span><strong>{config.provider}</strong></div>
              <div><span>Path</span><strong>{`${config.remoteSite} -> ${config.localSite}`}</strong></div>
            </div>
            <p className="remap-status mono">{status}</p>
          </article>
        </div>
      </section>
    </main>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
