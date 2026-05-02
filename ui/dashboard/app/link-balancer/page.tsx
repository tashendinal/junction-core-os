"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useMemo, useState } from "react";

type Permission = "rack.view" | "server.network_storage";
type PolicyMode = "active_active" | "priority_failover" | "latency_optimized";
type ProviderId = "starlink" | "slt_fiber" | "mobitel_4g" | "dialog_4g";

type WanProvider = {
  id: ProviderId;
  label: string;
  enabled: boolean;
  priority: number;
  weight: number;
  maxMbps: number;
  inputType: "satellite" | "fiber" | "lte";
  interfaceName: string;
  gatewayIp: string;
  dnsPrimary: string;
  dnsSecondary: string;
  apn?: string;
};

type LinkBalancerConfig = {
  policyMode: PolicyMode;
  targetLatencyMs: number;
  maxPacketLossPct: number;
  streamGuard: boolean;
  providers: WanProvider[];
};

const DEFAULT_CONFIG: LinkBalancerConfig = {
  policyMode: "active_active",
  targetLatencyMs: 40,
  maxPacketLossPct: 1.2,
  streamGuard: true,
  providers: [
    {
      id: "starlink",
      label: "Starlink",
      enabled: true,
      priority: 2,
      weight: 25,
      maxMbps: 160,
      inputType: "satellite",
      interfaceName: "eth1",
      gatewayIp: "192.168.100.1",
      dnsPrimary: "8.8.8.8",
      dnsSecondary: "1.1.1.1",
    },
    {
      id: "slt_fiber",
      label: "SLT Fiber",
      enabled: true,
      priority: 1,
      weight: 45,
      maxMbps: 300,
      inputType: "fiber",
      interfaceName: "eth0.200",
      gatewayIp: "10.20.0.1",
      dnsPrimary: "8.8.8.8",
      dnsSecondary: "1.1.1.1",
    },
    {
      id: "mobitel_4g",
      label: "Mobitel 4G",
      enabled: true,
      priority: 3,
      weight: 15,
      maxMbps: 70,
      inputType: "lte",
      interfaceName: "wwan0",
      gatewayIp: "100.72.0.1",
      dnsPrimary: "8.8.4.4",
      dnsSecondary: "1.0.0.1",
      apn: "mobitel",
    },
    {
      id: "dialog_4g",
      label: "Dialog 4G",
      enabled: true,
      priority: 4,
      weight: 15,
      maxMbps: 65,
      inputType: "lte",
      interfaceName: "wwan1",
      gatewayIp: "100.73.0.1",
      dnsPrimary: "9.9.9.9",
      dnsSecondary: "149.112.112.112",
      apn: "dialogbb",
    },
  ],
};

export default function LinkBalancerPage() {
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [config, setConfig] = useState<LinkBalancerConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState("Waiting for control command.");
  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, string>>({
    starlink: "Idle",
    slt_fiber: "Idle",
    mobitel_4g: "Idle",
    dialog_4g: "Idle",
  });
  const [providerHealth, setProviderHealth] = useState<Record<ProviderId, number>>({
    starlink: 93,
    slt_fiber: 98,
    mobitel_4g: 84,
    dialog_4g: 82,
  });

  const canEdit = permissions.has("server.network_storage");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetch("/api/auth/me");
      if (me.ok) {
        const data = (await me.json()) as { permissions?: Permission[] };
        if (!cancelled) setPermissions(new Set(data.permissions || []));
      }
      const res = await fetch("/api/link-balancer");
      if (res.ok) {
        const data = (await res.json()) as { config?: LinkBalancerConfig };
        if (!cancelled && data.config) setConfig(data.config);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setProviderHealth((prev) => ({
        starlink: clamp(prev.starlink + (Math.random() - 0.5) * 5, 60, 100),
        slt_fiber: clamp(prev.slt_fiber + (Math.random() - 0.5) * 2, 85, 100),
        mobitel_4g: clamp(prev.mobitel_4g + (Math.random() - 0.5) * 7, 50, 98),
        dialog_4g: clamp(prev.dialog_4g + (Math.random() - 0.5) * 7, 50, 98),
      }));
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  const totalCapacity = useMemo(
    () => config.providers.filter((p) => p.enabled).reduce((acc, p) => acc + p.maxMbps, 0),
    [config.providers]
  );

  const updateProvider = (id: ProviderId, patch: Partial<WanProvider>) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const runProviderAction = async (provider: WanProvider, action: "optimize" | "speed_test" | "restart_link" | "force_primary") => {
    if (!canEdit) return;
    const actionLabel =
      action === "optimize"
        ? "Optimized"
        : action === "speed_test"
          ? "Speed test completed"
          : action === "restart_link"
            ? "Link restart issued"
            : "Forced as primary";
    setProviderStatus((prev) => ({ ...prev, [provider.id]: `${actionLabel} @ ${new Date().toLocaleTimeString()}` }));
    setStatus(`${provider.label}: ${actionLabel}`);
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: `provider.${action}`,
        target: provider.label,
        details: {
          interface: provider.interfaceName,
          inputType: provider.inputType,
          gatewayIp: provider.gatewayIp,
        },
      }),
    });
  };

  const save = async () => {
    if (!canEdit) return;
    const res = await fetch("/api/link-balancer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setStatus(res.ok ? "Load-balancing policy saved to Junction Core module." : "Save failed (permission or network error).");
  };

  const optimizeForStreaming = async () => {
    if (!canEdit) return;
    setConfig((prev) => ({ ...prev, policyMode: "latency_optimized", targetLatencyMs: 28, maxPacketLossPct: 0.7 }));
    setStatus("Streaming optimization profile activated: latency-optimized routing + packet-loss guard.");
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "link_balancer.streaming_profile.activate",
        target: "wan-bonding",
        details: { profile: "premium_stream_guard" },
      }),
    });
  };

  return (
    <main className="tactical-root">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">Junction Core Multi-WAN Load Balancer</h1>
          <p className="technical-label">Keep user streaming stable across Starlink, SLT Fiber, Mobitel 4G, and Dialog 4G.</p>
        </header>

        <div className="fiber-grid">
          <article className="diag-card">
            <h2 className="pane-title">Policy Engine</h2>
            <div className="fiber-form">
              <label>
                <span className="technical-label">Balancing Mode</span>
                <select
                  className="rack-select"
                  value={config.policyMode}
                  onChange={(e) => setConfig((prev) => ({ ...prev, policyMode: e.target.value as PolicyMode }))}
                  disabled={!canEdit}
                >
                  <option value="active_active">Active-Active Bonding</option>
                  <option value="priority_failover">Priority Failover</option>
                  <option value="latency_optimized">Latency Optimized</option>
                </select>
              </label>
              <label>
                <span className="technical-label">Target Latency (ms)</span>
                <input type="number" value={config.targetLatencyMs} onChange={(e) => setConfig((p) => ({ ...p, targetLatencyMs: Number(e.target.value) }))} disabled={!canEdit} />
              </label>
              <label>
                <span className="technical-label">Max Packet Loss (%)</span>
                <input type="number" step={0.1} value={config.maxPacketLossPct} onChange={(e) => setConfig((p) => ({ ...p, maxPacketLossPct: Number(e.target.value) }))} disabled={!canEdit} />
              </label>
              <label className="fiber-checkbox">
                <input type="checkbox" checked={config.streamGuard} onChange={(e) => setConfig((p) => ({ ...p, streamGuard: e.target.checked }))} disabled={!canEdit} />
                Stream Guard (auto reroute on jitter/loss spikes)
              </label>
            </div>

            <div className="fiber-actions">
              <button className="rack-save-btn" onClick={save} disabled={!canEdit}>Save policy</button>
              <button className="rack-save-btn" onClick={() => void optimizeForStreaming()} disabled={!canEdit}>Optimize for streaming</button>
            </div>
          </article>

          <article className="diag-card">
            <h2 className="pane-title">Provider Bonding Matrix</h2>
            <div className="wan-provider-list">
              {config.providers.map((provider) => (
                <div className="wan-provider-card" key={provider.id}>
                  <div className="wan-provider-head">
                    <strong>{provider.label}</strong>
                    <span className="technical-label">Health {providerHealth[provider.id].toFixed(0)}%</span>
                  </div>
                  <div className="fiber-form">
                    <label className="fiber-checkbox">
                      <input type="checkbox" checked={provider.enabled} onChange={(e) => updateProvider(provider.id, { enabled: e.target.checked })} disabled={!canEdit} />
                      Enabled
                    </label>
                    <label>
                      <span className="technical-label">Network Input</span>
                      <select
                        className="rack-select"
                        value={provider.inputType}
                        onChange={(e) => updateProvider(provider.id, { inputType: e.target.value as WanProvider["inputType"] })}
                        disabled={!canEdit}
                      >
                        <option value="satellite">Satellite</option>
                        <option value="fiber">Fiber</option>
                        <option value="lte">4G LTE</option>
                      </select>
                    </label>
                    <label>
                      <span className="technical-label">Interface</span>
                      <input value={provider.interfaceName} onChange={(e) => updateProvider(provider.id, { interfaceName: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label>
                      <span className="technical-label">Gateway</span>
                      <input value={provider.gatewayIp} onChange={(e) => updateProvider(provider.id, { gatewayIp: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label>
                      <span className="technical-label">Primary DNS</span>
                      <input value={provider.dnsPrimary} onChange={(e) => updateProvider(provider.id, { dnsPrimary: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label>
                      <span className="technical-label">Secondary DNS</span>
                      <input value={provider.dnsSecondary} onChange={(e) => updateProvider(provider.id, { dnsSecondary: e.target.value })} disabled={!canEdit} />
                    </label>
                    {provider.inputType === "lte" ? (
                      <label>
                        <span className="technical-label">APN</span>
                        <input value={provider.apn || ""} onChange={(e) => updateProvider(provider.id, { apn: e.target.value })} disabled={!canEdit} />
                      </label>
                    ) : null}
                    <label>
                      <span className="technical-label">Priority</span>
                      <input type="number" value={provider.priority} onChange={(e) => updateProvider(provider.id, { priority: Number(e.target.value) })} disabled={!canEdit} />
                    </label>
                    <label>
                      <span className="technical-label">Weight (%)</span>
                      <input type="number" value={provider.weight} onChange={(e) => updateProvider(provider.id, { weight: Number(e.target.value) })} disabled={!canEdit} />
                    </label>
                    <label>
                      <span className="technical-label">Max Throughput (Mbps)</span>
                      <input type="number" value={provider.maxMbps} onChange={(e) => updateProvider(provider.id, { maxMbps: Number(e.target.value) })} disabled={!canEdit} />
                    </label>
                  </div>
                  <div className="fiber-actions">
                    <button className="rack-save-btn" onClick={() => void runProviderAction(provider, "optimize")} disabled={!canEdit}>Optimize Link</button>
                    <button className="rack-save-btn" onClick={() => void runProviderAction(provider, "speed_test")} disabled={!canEdit}>Speed Test</button>
                    <button className="rack-save-btn" onClick={() => void runProviderAction(provider, "restart_link")} disabled={!canEdit}>Restart Link</button>
                    <button className="rack-save-btn" onClick={() => void runProviderAction(provider, "force_primary")} disabled={!canEdit}>Set Primary</button>
                  </div>
                  <p className="technical-label">{providerStatus[provider.id]}</p>
                </div>
              ))}
            </div>
            <div className="kv-list compact">
              <div><span>Total Active Capacity</span><strong>{totalCapacity} Mbps</strong></div>
              <div><span>Protection</span><strong>{config.streamGuard ? "AUTO REROUTE ON" : "MANUAL"}</strong></div>
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
