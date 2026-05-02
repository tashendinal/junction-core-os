import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type AlertLevel = "critical" | "warning" | "info";
type AlertItem = { id: string; level: AlertLevel; message: string; source: string };

type NodeMetric = {
  nodeId: string;
  thermalC: number;
  cpuPct: number;
  memoryPct: number;
  diskPct: number;
  updatedAt: string;
};

type BalancerConfig = {
  targetLatencyMs: number;
  maxPacketLossPct: number;
  providers: Array<{ id: string; label: string; enabled: boolean }>;
};

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metricsPath = path.join(process.cwd(), "data", "node-metrics.json");
  const balancerPath = path.join(process.cwd(), "data", "link-balancer.json");
  const metricsDoc = await readJson<{ nodes: NodeMetric[] }>(metricsPath, { nodes: [] });
  const balancer = await readJson<BalancerConfig>(balancerPath, {
    targetLatencyMs: 40,
    maxPacketLossPct: 1.2,
    providers: [],
  });

  const alerts: AlertItem[] = [];
  for (const n of metricsDoc.nodes) {
    const ageSec = Math.floor((Date.now() - new Date(n.updatedAt).getTime()) / 1000);
    if (ageSec > 20) {
      alerts.push({
        id: `stale-${n.nodeId}`,
        level: "warning",
        message: `${n.nodeId} metrics stale (${ageSec}s old)`,
        source: "node-metrics",
      });
    }
    if (n.thermalC >= 82) {
      alerts.push({
        id: `thermal-${n.nodeId}`,
        level: "critical",
        message: `${n.nodeId} thermal critical (${n.thermalC}C)`,
        source: "thermal",
      });
    } else if (n.thermalC >= 74) {
      alerts.push({
        id: `thermal-w-${n.nodeId}`,
        level: "warning",
        message: `${n.nodeId} thermal warning (${n.thermalC}C)`,
        source: "thermal",
      });
    }
    if (n.diskPct >= 92) {
      alerts.push({
        id: `disk-${n.nodeId}`,
        level: "critical",
        message: `${n.nodeId} disk usage critical (${n.diskPct}%)`,
        source: "storage",
      });
    }
    if (n.cpuPct >= 95 || n.memoryPct >= 95) {
      alerts.push({
        id: `load-${n.nodeId}`,
        level: "warning",
        message: `${n.nodeId} high load (CPU ${n.cpuPct}% / MEM ${n.memoryPct}%)`,
        source: "compute",
      });
    }
  }

  const enabledProviders = balancer.providers.filter((p) => p.enabled).length;
  if (enabledProviders < 2) {
    alerts.push({
      id: "wan-redundancy-low",
      level: "critical",
      message: "WAN redundancy low: less than 2 providers enabled",
      source: "load-balancer",
    });
  } else {
    alerts.push({
      id: "wan-profile",
      level: "info",
      message: `WAN profile target latency ${balancer.targetLatencyMs}ms, packet loss ${balancer.maxPacketLossPct}%`,
      source: "load-balancer",
    });
  }

  const sorted = alerts.sort((a, b) => priority(b.level) - priority(a.level));
  return NextResponse.json({ generatedAt: new Date().toISOString(), alerts: sorted });
}

function priority(level: AlertLevel): number {
  if (level === "critical") return 3;
  if (level === "warning") return 2;
  return 1;
}
