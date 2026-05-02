import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type NodeMetric = {
  nodeId: string;
  ip: string;
  role: string;
  hwId: string;
  thermalC: number;
  cpuPct: number;
  memoryPct: number;
  diskPct: number;
  networkRxMbps: number;
  networkTxMbps: number;
  /** Optional plug-and-play GPU inventory from agent side (if present). */
  gpus?: Array<{
    vendor?: string;
    model?: string;
    vramGb?: number;
    pcieSlot?: string;
    driverVersion?: string;
    cudaVersion?: string;
    powerLimitW?: number;
    state?: "online" | "offline" | "maintenance";
  }>;
  updatedAt: string;
};

type NodeMetricsDoc = {
  updatedAt: string;
  nodes: NodeMetric[];
};

const AGENT_KEY = process.env.JUNCTION_AGENT_KEY || "junction-agent-dev-key";

function metricsPath() {
  return path.join(process.cwd(), "data", "node-metrics.json");
}

function fallbackDoc(): NodeMetricsDoc {
  const now = new Date().toISOString();
  return {
    updatedAt: now,
    nodes: [
      {
        nodeId: "n02",
        ip: "10.0.0.12",
        role: "Vision",
        hwId: "HW-OPi6U-3C91",
        thermalC: 68,
        cpuPct: 56,
        memoryPct: 62,
        diskPct: 39,
        networkRxMbps: 84,
        networkTxMbps: 72,
        updatedAt: now,
      },
      {
        nodeId: "n05",
        ip: "10.0.0.15",
        role: "Archive",
        hwId: "HW-OPi6U-7F2A",
        thermalC: 58,
        cpuPct: 34,
        memoryPct: 44,
        diskPct: 61,
        networkRxMbps: 44,
        networkTxMbps: 118,
        updatedAt: now,
      },
      {
        nodeId: "n07",
        ip: "10.0.0.17",
        role: "GPU Media",
        hwId: "HW-X86-L4-2201",
        thermalC: 63,
        cpuPct: 48,
        memoryPct: 57,
        diskPct: 42,
        networkRxMbps: 310,
        networkTxMbps: 266,
        gpus: [
          {
            vendor: "NVIDIA",
            model: "NVIDIA L4",
            vramGb: 24,
            pcieSlot: "slot-1",
            driverVersion: "550.x",
            cudaVersion: "12.4",
            powerLimitW: 72,
            state: "online",
          },
        ],
        updatedAt: now,
      },
    ],
  };
}

async function readDoc(): Promise<NodeMetricsDoc> {
  try {
    const raw = await fs.readFile(metricsPath(), "utf8");
    return JSON.parse(raw) as NodeMetricsDoc;
  } catch {
    return fallbackDoc();
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
  return NextResponse.json(await readDoc());
}

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  const agentKey = req.headers.get("x-junction-agent-key");
  const allowed = hasPermission(user, "server.health") || agentKey === AGENT_KEY;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<NodeMetric>;
  try {
    body = (await req.json()) as Partial<NodeMetric>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.nodeId || !body.ip) {
    return NextResponse.json({ error: "nodeId and ip are required" }, { status: 400 });
  }

  const current = await readDoc();
  const nextMetric: NodeMetric = {
    nodeId: body.nodeId,
    ip: body.ip,
    role: body.role || "unknown",
    hwId: body.hwId || "unknown",
    thermalC: Number(body.thermalC ?? 0),
    cpuPct: Number(body.cpuPct ?? 0),
    memoryPct: Number(body.memoryPct ?? 0),
    diskPct: Number(body.diskPct ?? 0),
    networkRxMbps: Number(body.networkRxMbps ?? 0),
    networkTxMbps: Number(body.networkTxMbps ?? 0),
    gpus: Array.isArray(body.gpus) ? body.gpus : undefined,
    updatedAt: new Date().toISOString(),
  };
  const existing = new Map(current.nodes.map((n) => [n.nodeId, n]));
  existing.set(nextMetric.nodeId, nextMetric);
  const nextDoc: NodeMetricsDoc = {
    updatedAt: new Date().toISOString(),
    nodes: Array.from(existing.values()).sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
  };

  await fs.mkdir(path.dirname(metricsPath()), { recursive: true });
  await fs.writeFile(metricsPath(), `${JSON.stringify(nextDoc, null, 2)}\n`, "utf8");
  return NextResponse.json({ success: true, node: nextMetric });
}
