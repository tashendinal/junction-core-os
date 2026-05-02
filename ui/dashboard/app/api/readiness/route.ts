import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { readGpuModules, rollupGpuReadiness } from "../../../lib/gpuModuleStore";
import { readOverlayModules, rollupOverlayReadiness } from "../../../lib/overlayModuleStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";
import { rollupIsoRecorderReadiness } from "../../../lib/isoRecorderProbe";
import { readRecordingRack } from "../../../lib/recordingRackStore";
import { effectiveVisionBase, readServerConfig } from "../../../lib/serverControl";

type ReadinessStatus = "pass" | "warn" | "fail";
type ReadinessCheck = { id: string; label: string; status: ReadinessStatus; detail: string };

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

  const nodeDoc = await readJson<{ nodes: Array<{ thermalC: number; diskPct: number; updatedAt: string }> }>(
    path.join(process.cwd(), "data", "node-metrics.json"),
    { nodes: [] }
  );
  const balancer = await readJson<{ providers: Array<{ enabled: boolean }> }>(
    path.join(process.cwd(), "data", "link-balancer.json"),
    { providers: [] }
  );
  const profiles = await readJson<{ profiles: Array<{ enabled: boolean }> }>(
    path.join(process.cwd(), "data", "broadcast-profiles.json"),
    { profiles: [] }
  );

  const checks: ReadinessCheck[] = [];
  const staleCount = nodeDoc.nodes.filter((n) => Date.now() - new Date(n.updatedAt).getTime() > 15000).length;
  checks.push({
    id: "node-telemetry",
    label: "Node telemetry freshness",
    status: staleCount > 0 ? "warn" : "pass",
    detail: staleCount > 0 ? `${staleCount} node(s) stale` : "All telemetry fresh",
  });
  const hot = nodeDoc.nodes.filter((n) => n.thermalC >= 82).length;
  checks.push({
    id: "thermal",
    label: "Thermal safety",
    status: hot > 0 ? "fail" : "pass",
    detail: hot > 0 ? `${hot} node(s) above critical thermal` : "No thermal critical nodes",
  });
  const diskCrit = nodeDoc.nodes.filter((n) => n.diskPct >= 92).length;
  checks.push({
    id: "storage",
    label: "Recording storage headroom",
    status: diskCrit > 0 ? "fail" : "pass",
    detail: diskCrit > 0 ? `${diskCrit} node(s) disk critical` : "Storage headroom healthy",
  });
  const activeWan = balancer.providers.filter((p) => p.enabled).length;
  checks.push({
    id: "wan-redundancy",
    label: "WAN redundancy",
    status: activeWan >= 2 ? "pass" : "fail",
    detail: `${activeWan} provider(s) enabled`,
  });
  const enabledProfiles = profiles.profiles.filter((p) => p.enabled).length;
  checks.push({
    id: "broadcast-profile",
    label: "Broadcast output profile",
    status: enabledProfiles > 0 ? "pass" : "warn",
    detail: enabledProfiles > 0 ? `${enabledProfiles} profile(s) active` : "No active profile",
  });

  if (process.env.READINESS_SKIP_VISION !== "1") {
    const cfg = await readServerConfig();
    const base = effectiveVisionBase(cfg);
    try {
      const vres = await fetch(`${base}/health`, { cache: "no-store" });
      if (!vres.ok) {
        checks.push({
          id: "vision-ndi",
          label: "Vision / NDI discovery service",
          status: "warn",
          detail: `HTTP ${vres.status} from ${base}`,
        });
      } else {
        const vj = (await vres.json()) as { ndi?: { last_source_count?: number; last_scan_unix_ms?: number | null } };
        const n = vj.ndi?.last_source_count ?? 0;
        const scanned = vj.ndi?.last_scan_unix_ms;
        checks.push({
          id: "vision-ndi",
          label: "Vision / NDI discovery service",
          status: "pass",
          detail:
            scanned == null
              ? `Reachable at ${base}; no scan yet`
              : `Reachable; last scan ${n} source(s)`,
        });
      }
    } catch {
      checks.push({
        id: "vision-ndi",
        label: "Vision / NDI discovery service",
        status: "fail",
        detail: `Unreachable at ${base} (set VISION_HTTP_URL or READINESS_SKIP_VISION=1)`,
      });
    }
  }

  if (process.env.READINESS_SKIP_OUTPUT_ROUTER !== "1") {
    const url = process.env.OUTPUT_ROUTER_HEALTH_URL?.trim();
    if (url) {
      try {
        const ores = await fetch(url.replace(/\/$/, "") + "/health", { cache: "no-store" });
        if (!ores.ok) {
          checks.push({
            id: "output-router",
            label: "NDI output router (PGM / MV publish)",
            status: "warn",
            detail: `HTTP ${ores.status} from ${url}`,
          });
        } else {
          const oj = (await ores.json()) as {
            status?: string;
            slots?: Array<{ enabled?: boolean; ok?: boolean; detail?: string }>;
          };
          const degraded = oj.status === "degraded";
          const slots = Array.isArray(oj.slots) ? oj.slots : [];
          const bad = slots.filter((s) => s.enabled && !s.ok).length;
          checks.push({
            id: "output-router",
            label: "NDI output router (PGM / MV publish)",
            status: degraded || bad > 0 ? "warn" : "pass",
            detail:
              bad > 0
                ? `${bad} enabled slot(s) not streaming (${url})`
                : `Healthy (${oj.status ?? "ok"}) — ${url}`,
          });
        }
      } catch {
        checks.push({
          id: "output-router",
          label: "NDI output router (PGM / MV publish)",
          status: "warn",
          detail: `Unreachable at ${url}`,
        });
      }
    }
  }

  if (process.env.READINESS_SKIP_ISO !== "1") {
    const rack = await readRecordingRack();
    const iso = await rollupIsoRecorderReadiness(rack);
    checks.push({
      id: "iso-recorders",
      label: "ISO recorder agents (recording rack)",
      status: iso.status,
      detail: iso.detail,
    });
  }

  if (process.env.READINESS_SKIP_GPU !== "1") {
    const gpus = await readGpuModules();
    const gpu = rollupGpuReadiness(gpus);
    checks.push({
      id: "gpu-modules",
      label: "GPU modules / media acceleration",
      status: gpu.status,
      detail: gpu.detail,
    });
  }

  if (process.env.READINESS_SKIP_OVERLAY !== "1") {
    const overlays = await readOverlayModules();
    const ov = rollupOverlayReadiness(overlays);
    checks.push({
      id: "overlay-modules",
      label: "Graphics / overlay modules",
      status: ov.status,
      detail: ov.detail,
    });
  }

  const overall: ReadinessStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "pass";
  return NextResponse.json({ generatedAt: new Date().toISOString(), overall, checks });
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

  let body: { action?: "live_safe_mode" | "apply_profile"; profileId?: string };
  try {
    body = (await req.json()) as { action?: "live_safe_mode" | "apply_profile"; profileId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  if (body.action === "live_safe_mode") {
    const balancerPath = path.join(process.cwd(), "data", "link-balancer.json");
    const balancer = await readJson<Record<string, unknown>>(balancerPath, {});
    const next = {
      ...balancer,
      policyMode: "priority_failover",
      targetLatencyMs: 60,
      maxPacketLossPct: 2.0,
      streamGuard: true,
    };
    await fs.mkdir(path.dirname(balancerPath), { recursive: true });
    await fs.writeFile(balancerPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  if (body.action === "apply_profile" && body.profileId) {
    const profilePath = path.join(process.cwd(), "data", "broadcast-profiles.json");
    const doc = await readJson<{ updatedAt: string; profiles: Array<Record<string, unknown>> }>(profilePath, {
      updatedAt: new Date().toISOString(),
      profiles: [],
    });
    const next = {
      updatedAt: new Date().toISOString(),
      profiles: doc.profiles.map((p) => ({ ...p, enabled: p.id === body.profileId })),
    };
    await fs.mkdir(path.dirname(profilePath), { recursive: true });
    await fs.writeFile(profilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  await writeAuditLog(user, {
    action: "readiness.action.execute",
    target: "go-live-readiness",
    details: body,
  });
  return NextResponse.json({ success: true });
}
