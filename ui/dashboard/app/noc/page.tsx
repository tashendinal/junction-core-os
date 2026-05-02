"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useMemo, useState } from "react";

type NodeMetric = {
  nodeId: string;
  ip: string;
  role: string;
  thermalC: number;
  cpuPct: number;
  memoryPct: number;
  diskPct: number;
  networkRxMbps: number;
  networkTxMbps: number;
  updatedAt: string;
};

type AlertItem = { id: string; level: "critical" | "warning" | "info"; message: string; source: string };
type NodeAction =
  | "reboot"
  | "shutdown"
  | "maintenance_on"
  | "maintenance_off"
  | "restart_agent"
  | "restart_vision"
  | "start_vision"
  | "stop_vision";
type NodeCommand = {
  id: string;
  nodeId: string;
  action: NodeAction;
  status: string;
  createdAt: string;
  createdBy: string;
};

export default function NocPage() {
  const [nodes, setNodes] = useState<NodeMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [commands, setCommands] = useState<NodeCommand[]>([]);
  const [lastSync, setLastSync] = useState<string>("never");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [dispatchStatus, setDispatchStatus] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [mRes, aRes, cRes, meRes] = await Promise.all([
        fetch("/api/node-metrics"),
        fetch("/api/alerts"),
        fetch("/api/node-commands"),
        fetch("/api/auth/me"),
      ]);
      if (!mounted) return;
      if (mRes.ok) {
        const m = (await mRes.json()) as { nodes: NodeMetric[]; updatedAt: string };
        setNodes(m.nodes || []);
        setLastSync(m.updatedAt || new Date().toISOString());
      }
      if (aRes.ok) {
        const a = (await aRes.json()) as { alerts: AlertItem[] };
        setAlerts(a.alerts || []);
      }
      if (cRes.ok) {
        const c = (await cRes.json()) as { commands: NodeCommand[] };
        setCommands(c.commands || []);
      }
      if (meRes.ok) {
        const me = (await meRes.json()) as { permissions?: string[] };
        setPermissions(new Set(me.permissions || []));
      }
    };
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const totals = useMemo(() => {
    if (!nodes.length) return { cpu: 0, mem: 0, disk: 0, rx: 0, tx: 0 };
    return {
      cpu: Math.round(nodes.reduce((acc, n) => acc + n.cpuPct, 0) / nodes.length),
      mem: Math.round(nodes.reduce((acc, n) => acc + n.memoryPct, 0) / nodes.length),
      disk: Math.round(nodes.reduce((acc, n) => acc + n.diskPct, 0) / nodes.length),
      rx: Math.round(nodes.reduce((acc, n) => acc + n.networkRxMbps, 0)),
      tx: Math.round(nodes.reduce((acc, n) => acc + n.networkTxMbps, 0)),
    };
  }, [nodes]);

  const canControlNodes = permissions.has("server.maintenance");

  const sendCommand = async (nodeId: string, action: NodeAction) => {
    if (!canControlNodes) return;
    const res = await fetch("/api/node-commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, action }),
    });
    if (!res.ok) {
      setDispatchStatus(`Failed to dispatch ${action} for ${nodeId}`);
      return;
    }
    setDispatchStatus(`Queued ${action} for ${nodeId}`);
    const latest = await fetch("/api/node-commands");
    if (latest.ok) {
      const c = (await latest.json()) as { commands: NodeCommand[] };
      setCommands(c.commands || []);
    }
  };

  return (
    <main className="tactical-root">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">Network Operations Center</h1>
          <p className="technical-label">Real-time node health, alert queue, and transport visibility.</p>
        </header>

        <div className="fiber-grid">
          <article className="diag-card">
            <h2 className="pane-title">Cluster Summary</h2>
            <div className="kv-list compact">
              <div><span>Nodes Online</span><strong>{nodes.length}</strong></div>
              <div><span>Avg CPU</span><strong>{totals.cpu}%</strong></div>
              <div><span>Avg Memory</span><strong>{totals.mem}%</strong></div>
              <div><span>Avg Disk</span><strong>{totals.disk}%</strong></div>
              <div><span>Total RX</span><strong>{totals.rx} Mbps</strong></div>
              <div><span>Total TX</span><strong>{totals.tx} Mbps</strong></div>
            </div>
            <p className="technical-label">Last sync: {new Date(lastSync).toLocaleTimeString()}</p>
          </article>

          <article className="diag-card">
            <h2 className="pane-title">Active Alerts</h2>
            <div className="noc-alerts">
              {alerts.length === 0 ? <p className="technical-label">No active alerts</p> : null}
              {alerts.map((a) => (
                <div key={a.id} className={`noc-alert noc-alert-${a.level}`}>
                  <strong>{a.level.toUpperCase()}</strong>
                  <span>{a.message}</span>
                  <small>{a.source}</small>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className="diag-card">
          <h2 className="pane-title">Node Metrics</h2>
          <p className="technical-label">{canControlNodes ? "Admin node control enabled" : "Read-only role: node control disabled"}</p>
          {dispatchStatus ? <p className="remap-status mono">{dispatchStatus}</p> : null}
          <div className="noc-node-grid">
            {nodes.map((n) => (
              <div key={n.nodeId} className="wan-provider-card">
                <div className="wan-provider-head">
                  <strong>{n.nodeId}</strong>
                  <span className="technical-label">{n.role}</span>
                </div>
                <div className="kv-list compact">
                  <div><span>IP</span><strong>{n.ip}</strong></div>
                  <div><span>Thermal</span><strong>{n.thermalC}C</strong></div>
                  <div><span>CPU</span><strong>{n.cpuPct}%</strong></div>
                  <div><span>Memory</span><strong>{n.memoryPct}%</strong></div>
                  <div><span>Disk</span><strong>{n.diskPct}%</strong></div>
                  <div><span>RX/TX</span><strong>{n.networkRxMbps}/{n.networkTxMbps} Mbps</strong></div>
                </div>
                <div className="fiber-actions">
                  <button className="rack-save-btn" disabled={!canControlNodes} onClick={() => void sendCommand(n.nodeId, "reboot")}>
                    Reboot
                  </button>
                  <button className="rack-save-btn" disabled={!canControlNodes} onClick={() => void sendCommand(n.nodeId, "shutdown")}>
                    Shutdown
                  </button>
                  <button className="rack-save-btn" disabled={!canControlNodes} onClick={() => void sendCommand(n.nodeId, "maintenance_on")}>
                    Maint ON
                  </button>
                  <button className="rack-save-btn" disabled={!canControlNodes} onClick={() => void sendCommand(n.nodeId, "maintenance_off")}>
                    Maint OFF
                  </button>
                  <button className="rack-save-btn" disabled={!canControlNodes} onClick={() => void sendCommand(n.nodeId, "restart_agent")}>
                    Restart Agent
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="diag-card">
          <h2 className="pane-title">Command Queue</h2>
          <div className="noc-alerts">
            {commands.length === 0 ? <p className="technical-label">No commands queued yet</p> : null}
            {commands.map((cmd) => (
              <div key={cmd.id} className="noc-alert noc-alert-info">
                <strong>{cmd.action}</strong>
                <span>{cmd.nodeId} · {cmd.status}</span>
                <small>{new Date(cmd.createdAt).toLocaleTimeString()} · {cmd.createdBy}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
