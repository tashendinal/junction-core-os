"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const MIN_RACK_U = 1;
const MAX_RACK_U = 52;

function clampRackU(value: number): number {
  if (Number.isNaN(value)) return MIN_RACK_U;
  return Math.min(MAX_RACK_U, Math.max(MIN_RACK_U, Math.round(value)));
}

type NodeRole = "Vision" | "Archive" | "AI Matcher";

type RackNode = {
  id: string;
  nodeLabel: string;
  hwId: string;
  ip: string;
  functionalRole: string;
  role: NodeRole;
  tempC: number;
  syncing: boolean;
  offline: boolean;
};

type SlotState = {
  u: number;
  nodeId: string | null;
};

const INITIAL_NODES: RackNode[] = [
  {
    id: "n05",
    nodeLabel: "Node 05",
    hwId: "HW-OPi6U-7F2A",
    ip: "10.0.0.15",
    functionalRole: "Primary Archive",
    role: "Archive",
    tempC: 58,
    syncing: false,
    offline: false,
  },
  {
    id: "n02",
    nodeLabel: "Node 02",
    hwId: "HW-OPi6U-3C91",
    ip: "10.0.0.12",
    functionalRole: "Vision Edge",
    role: "Vision",
    tempC: 72,
    syncing: true,
    offline: false,
  },
  {
    id: "n07",
    nodeLabel: "Node 07",
    hwId: "HW-OPi6U-9D44",
    ip: "10.0.0.17",
    functionalRole: "AI Matcher",
    role: "AI Matcher",
    tempC: 81,
    syncing: false,
    offline: false,
  },
  {
    id: "n01",
    nodeLabel: "Node 01",
    hwId: "HW-OPi6U-1A00",
    ip: "10.0.0.11",
    functionalRole: "Standby",
    role: "Vision",
    tempC: 48,
    syncing: false,
    offline: false,
  },
  {
    id: "n09",
    nodeLabel: "Node 09",
    hwId: "HW-OPi6U-DEAD",
    ip: "—",
    functionalRole: "Failed",
    role: "Archive",
    tempC: 0,
    syncing: false,
    offline: true,
  },
];

function ledForPower(node: RackNode | undefined): "green" | "amber" | "red" {
  if (!node || node.offline) return "red";
  return "green";
}

function ledForActivity(node: RackNode | undefined): "green" | "amber" | "red" {
  if (!node || node.offline) return "red";
  if (node.syncing || node.tempC >= 70) return "amber";
  return "green";
}

function buildInitialSlots(units: number): SlotState[] {
  const list = Array.from({ length: units }, (_, i) => ({
    u: units - i,
    nodeId: null as string | null,
  }));
  const put = (u: number, id: string) => {
    const row = list.find((s) => s.u === u);
    if (row) row.nodeId = id;
  };
  put(5, "n05");
  put(8, "n02");
  put(12, "n07");
  return list;
}

export default function ServerRackPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [rackUnits, setRackUnits] = useState(21);
  const [nodes, setNodes] = useState<RackNode[]>(() => INITIAL_NODES.map((n) => ({ ...n })));
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const [slots, setSlots] = useState<SlotState[]>(() => buildInitialSlots(21));
  const [selectedId, setSelectedId] = useState<string | null>("n05");
  const [remapStatus, setRemapStatus] = useState<string>("");
  const [ssdReport, setSsdReport] = useState<string>("");

  useEffect(() => {
    setSlots((prev) => {
      const next = Array.from({ length: rackUnits }, (_, i) => ({
        u: rackUnits - i,
        nodeId: null as string | null,
      }));
      const byU = new Map(prev.map((s) => [s.u, s.nodeId]));
      for (const s of next) {
        const existing = byU.get(s.u);
        if (existing !== undefined) s.nodeId = existing;
      }
      return next;
    });
  }, [rackUnits]);

  useEffect(() => {
    const t = setInterval(() => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.offline) return { ...n, tempC: 0 };
          const drift = (Math.random() - 0.5) * 4;
          return {
            ...n,
            tempC: Math.max(38, Math.min(92, n.tempC + drift)),
            syncing: n.syncing ? Math.random() > 0.15 : Math.random() > 0.97,
          };
        })
      );
    }, 1200);
    return () => clearInterval(t);
  }, []);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const assignedIds = useMemo(() => new Set(slots.map((s) => s.nodeId).filter(Boolean) as string[]), [slots]);

  const unassignedNodes = useMemo(() => nodes.filter((n) => !assignedIds.has(n.id)), [nodes, assignedIds]);

  const selectedNode = selectedId ? nodeById.get(selectedId) : undefined;

  const heatColors = useMemo(() => {
    return slots.map((s) => {
      const n = s.nodeId ? nodeById.get(s.nodeId) : undefined;
      if (!n || n.offline) return "rgba(40,40,40,0.9)";
      const t = Math.min(1, Math.max(0, (n.tempC - 40) / 45));
      const r = Math.round(40 + t * 200);
      const g = Math.round(180 - t * 170);
      const b = Math.round(80 - t * 60);
      return `rgb(${r},${g},${b})`;
    });
  }, [slots, nodeById]);

  const onDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData("text/node-id", nodeId);
    e.dataTransfer.effectAllowed = "move";
  };

  const persistSlots = useCallback(async (slotList: SlotState[]) => {
    const nMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    const payload = {
      slots: slotList
        .filter((s) => s.nodeId)
        .map((s) => {
          const n = nMap.get(s.nodeId!);
          return {
            u_position: s.u,
            node_label: n?.nodeLabel ?? s.nodeId!,
            hw_id: n?.hwId ?? "unknown",
            ip_address: n?.ip ?? "0.0.0.0",
            functional_role: n?.functionalRole ?? "Unassigned",
          };
        }),
    };
    try {
      const res = await fetch("/api/cluster-remap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; cluster_json_path?: string; grpc?: { ok: boolean; message: string } };
      if (data.success) {
        setRemapStatus(`Saved ${data.cluster_json_path ?? "cluster.json"} · ${data.grpc?.message ?? ""}`);
      } else {
        setRemapStatus("Remap failed");
      }
    } catch {
      setRemapStatus("Network error calling remap API");
    }
  }, []);

  const onSlotDrop = (e: React.DragEvent, u: number) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData("text/node-id");
    if (!nodeId) return;
    setSlots((prev) => {
      const next = prev.map((s) => {
        if (s.u === u) return { ...s, nodeId };
        if (s.nodeId === nodeId) return { ...s, nodeId: null };
        return s;
      });
      void persistSlots(next);
      return next;
    });
    setSelectedId(nodeId);
  };

  const persistCluster = useCallback(async () => {
    await persistSlots(slots);
  }, [slots, persistSlots]);

  const updateNodeRole = (id: string, role: NodeRole) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              role,
              functionalRole:
                role === "Vision" ? "Vision Edge" : role === "Archive" ? "Primary Archive" : "AI Matcher",
            }
          : n
      )
    );
  };

  const runSsdScrub = (id: string) => {
    const n = nodeById.get(id);
    const mock = [
      `smartctl 7.3 2022-02-28 r5338 [aarch64-linux-6.1.0] (local build)`,
      `=== START OF INFORMATION SECTION ===`,
      `Model Number:    Junction NVMe ${n?.hwId ?? id}`,
      `Serial Number:   JS-${id.toUpperCase()}-NVME`,
      `Temperature:     ${n && !n.offline ? `${n.tempC.toFixed(0)} Celsius` : "—"}`,
      `Percentage Used: ${n && !n.offline ? "2%" : "—"}`,
      `Data Units Read:  1,240,192 [635 GB]`,
      `Data Units Written: 88,192 [45.1 TB]`,
      `=== SMART overall-health self-assessment test result: PASSED ===`,
    ].join("\n");
    setSsdReport(mock);
  };

  return (
    <main className="tactical-root rack-page">
      <nav className="top-nav tactile-node">
        <div className="nav-logo-slot" aria-label="Junction Core logo slot">
          <span>JUNCTION CORE</span>
        </div>
        <div className="top-nav-tabs top-nav-tabs-four">
          <button className={`top-tab ${pathname === "/" ? "active" : ""}`} onClick={() => router.push("/")}>
            [SWITCHER]
          </button>
          <button
            className={`top-tab ${pathname === "/talkback" ? "active" : ""}`}
            onClick={() => router.push("/talkback")}
          >
            [COMMS]
          </button>
          <button
            className={`top-tab ${pathname === "/system-health" ? "active" : ""}`}
            onClick={() => router.push("/system-health")}
          >
            [STORAGE/STREAM]
          </button>
          <button
            className={`top-tab ${pathname === "/server-rack" ? "active" : ""}`}
            onClick={() => router.push("/server-rack")}
          >
            [RACK]
          </button>
        </div>
      </nav>

      <div className="rack-workspace">
        <header className="rack-header tactile-node">
          <div>
            <h1 className="pane-title">Server Rack Management</h1>
            <p className="technical-label">
              Drag nodes into U slots · Thermal source: vcgencmd measure_temp · Role: /etc/junction/node_role · SSD: smartctl
              -a /dev/nvme0n1
            </p>
          </div>
          <div className="rack-toolbar">
            <label className="rack-toggle rack-height-field">
              <span className="technical-label">Rack height (U)</span>
              <div className="rack-height-input-row">
                <input
                  type="number"
                  className="rack-select rack-u-input"
                  min={MIN_RACK_U}
                  max={MAX_RACK_U}
                  step={1}
                  value={rackUnits}
                  onChange={(e) => setRackUnits(clampRackU(Number(e.target.value)))}
                  aria-label="Custom rack height in rack units"
                />
                <span className="rack-u-suffix">U</span>
              </div>
              <div className="rack-presets" role="group" aria-label="Common rack sizes">
                {[12, 16, 21, 24, 27, 42, 48].map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`rack-preset-btn ${rackUnits === u ? "active" : ""}`}
                    onClick={() => setRackUnits(u)}
                  >
                    {u}U
                  </button>
                ))}
              </div>
            </label>
            <button type="button" className="rack-save-btn" onClick={() => void persistCluster()}>
              Push cluster.json
            </button>
          </div>
        </header>

        <div className="rack-columns">
          <section className="rack-heatmap tactile-node" aria-label="Thermal heatmap">
            <h2 className="pane-title">Thermal map</h2>
            <p className="technical-label">Hot zones (simulated vcgencmd)</p>
            <div className="heatmap-strip">
              {heatColors.map((c, i) => (
                <div key={`h-${i}`} className="heatmap-cell" style={{ background: c }} title={`U${slots[i]?.u ?? i}`} />
              ))}
            </div>
          </section>

          <section className="rack-frame tactile-node" aria-label="Rack silhouette">
            <div className="rack-silhouette">
              <div className="rack-rail rack-rail-left" />
              <div className="rack-rail rack-rail-right" />
              <div className="rack-slots">
                {slots.map((slot, idx) => {
                  const node = slot.nodeId ? nodeById.get(slot.nodeId) : undefined;
                  const pLed = ledForPower(node);
                  const aLed = ledForActivity(node);
                  return (
                    <div
                      key={slot.u}
                      className="rack-slot"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onSlotDrop(e, slot.u)}
                      onClick={() => node && setSelectedId(node.id)}
                    >
                      <div className="rack-slot-meta">
                        <span className="rack-u-label">U{slot.u}</span>
                        <div className="rack-led-group" aria-hidden>
                          <span className={`rack-led rack-led-${pLed}`} title="Power" />
                          <span className={`rack-led rack-led-${aLed}`} title="Activity" />
                        </div>
                      </div>
                      <div className="rack-slot-body">
                        {node ? (
                          <div
                            draggable
                            onDragStart={(e) => onDragStart(e, node.id)}
                            className={`rack-node-card ${selectedId === node.id ? "selected" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(node.id);
                            }}
                          >
                            <strong>{node.nodeLabel}</strong>
                            <span className="mono">{node.hwId}</span>
                            <span className="mono">{node.ip}</span>
                            <small>{node.functionalRole}</small>
                          </div>
                        ) : (
                          <div className="rack-slot-empty">Drop node</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="rack-side tactile-node">
            <h2 className="pane-title">Node pool</h2>
            <p className="technical-label">Unassigned modules</p>
            <div className="rack-pool">
              {unassignedNodes.map((n) => (
                <div
                  key={n.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, n.id)}
                  className={`rack-node-card pool ${selectedId === n.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(n.id)}
                >
                  <strong>{n.nodeLabel}</strong>
                  <span className="mono">{n.hwId}</span>
                  <span className="mono">{n.ip}</span>
                </div>
              ))}
              {unassignedNodes.length === 0 ? <p className="technical-label">All nodes racked</p> : null}
            </div>

            <h2 className="pane-title module-detail-title">Module detail</h2>
            {selectedNode ? (
              <div className="module-detail">
                <div className="kv-list compact">
                  <div>
                    <span>HW-ID</span>
                    <strong>{selectedNode.hwId}</strong>
                  </div>
                  <div>
                    <span>IP</span>
                    <strong>{selectedNode.ip}</strong>
                  </div>
                  <div>
                    <span>Temp (vcgencmd)</span>
                    <strong>{selectedNode.offline ? "—" : `${selectedNode.tempC.toFixed(1)}°C`}</strong>
                  </div>
                </div>
                <label className="role-field">
                  <span className="technical-label">Role assignment (/etc/junction/node_role)</span>
                  <select
                    className="rack-select"
                    value={selectedNode.role}
                    onChange={(e) => updateNodeRole(selectedNode.id, e.target.value as NodeRole)}
                  >
                    <option value="Vision">Vision</option>
                    <option value="Archive">Archive</option>
                    <option value="AI Matcher">AI Matcher</option>
                  </select>
                </label>
                <button type="button" className="rack-scrub-btn" onClick={() => runSsdScrub(selectedNode.id)}>
                  SSD scrub (smartctl -a /dev/nvme0n1)
                </button>
                {ssdReport ? (
                  <pre className="ssd-report mono">{ssdReport}</pre>
                ) : null}
              </div>
            ) : (
              <p className="technical-label">Select a node</p>
            )}

            <p className="remap-status mono">{remapStatus}</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
