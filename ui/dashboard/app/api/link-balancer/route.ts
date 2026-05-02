import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type WanProvider = {
  id: "starlink" | "slt_fiber" | "mobitel_4g" | "dialog_4g";
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
  policyMode: "active_active" | "priority_failover" | "latency_optimized";
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

function hydrateConfig(input: Partial<LinkBalancerConfig> | null | undefined): LinkBalancerConfig {
  const byId = new Map((input?.providers || []).map((p) => [p.id, p]));
  return {
    policyMode: input?.policyMode || DEFAULT_CONFIG.policyMode,
    targetLatencyMs: Number(input?.targetLatencyMs ?? DEFAULT_CONFIG.targetLatencyMs),
    maxPacketLossPct: Number(input?.maxPacketLossPct ?? DEFAULT_CONFIG.maxPacketLossPct),
    streamGuard: Boolean(input?.streamGuard ?? DEFAULT_CONFIG.streamGuard),
    providers: DEFAULT_CONFIG.providers.map((base) => ({
      ...base,
      ...(byId.get(base.id) || {}),
    })),
  };
}

function configPath() {
  return path.join(process.cwd(), "data", "link-balancer.json");
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

  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const config = hydrateConfig(JSON.parse(raw) as Partial<LinkBalancerConfig>);
    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ config: DEFAULT_CONFIG });
  }
}

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, "server.network_storage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<LinkBalancerConfig>;
  try {
    body = (await req.json()) as Partial<LinkBalancerConfig>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const safeConfig = hydrateConfig(body);
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), `${JSON.stringify(safeConfig, null, 2)}\n`, "utf8");
  await writeAuditLog(user, {
    action: "link_balancer.config.update",
    target: "wan-bonding",
    details: safeConfig,
  });
  return NextResponse.json({ success: true, config: safeConfig });
}
