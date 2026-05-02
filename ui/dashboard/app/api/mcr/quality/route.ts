import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { readGpuModules, rollupGpuReadiness } from "../../../../lib/gpuModuleStore";
import { readObservabilityEvents } from "../../../../lib/observability";
import { readOverlayModules, rollupOverlayReadiness } from "../../../../lib/overlayModuleStore";
import { readRecordingSessions } from "../../../../lib/recordingRackStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

type Severity = "critical" | "warning" | "info";
type McrCheck = {
  id: string;
  label: string;
  severity: Severity;
  status: "ok" | "warn" | "fail";
  detail: string;
};

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", name), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function user(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(SESSION_COOKIE + "="))
    ?.split("=")[1];
  return parseSessionToken(token);
}

export async function GET(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks: McrCheck[] = [];

  const metrics = await readJson<{ nodes: Array<{ nodeId: string; updatedAt: string; thermalC: number; cpuPct: number; diskPct: number }> }>(
    "node-metrics.json",
    { nodes: [] }
  );
  const stale = metrics.nodes.filter((n) => Date.now() - new Date(n.updatedAt).getTime() > 20000);
  checks.push({
    id: "telemetry-freshness",
    label: "Node telemetry freshness",
    severity: stale.length > 0 ? "warning" : "info",
    status: stale.length > 0 ? "warn" : "ok",
    detail: stale.length > 0 ? stale.map((n) => n.nodeId).join(", ") + " stale" : "All node telemetry fresh",
  });

  const hot = metrics.nodes.filter((n) => n.thermalC >= 82);
  checks.push({
    id: "thermal-guard",
    label: "Thermal guard",
    severity: hot.length > 0 ? "critical" : "info",
    status: hot.length > 0 ? "fail" : "ok",
    detail: hot.length > 0 ? hot.map((n) => n.nodeId + "@" + n.thermalC + "C").join(" · ") : "No critical thermals",
  });

  const sessions = await readRecordingSessions();
  const recs = sessions.sessions.filter((s) => s.state === "recording");
  const errs = sessions.sessions.filter((s) => s.state === "error");
  checks.push({
    id: "iso-record-health",
    label: "ISO recording health",
    severity: errs.length > 0 ? "critical" : recs.length > 0 ? "info" : "warning",
    status: errs.length > 0 ? "fail" : recs.length > 0 ? "ok" : "warn",
    detail:
      errs.length > 0
        ? errs.length + " recording path(s) in error"
        : recs.length > 0
          ? recs.length + " recording path(s) active"
          : "No active recording sessions",
  });

  const gpus = rollupGpuReadiness(await readGpuModules());
  checks.push({
    id: "gpu-media",
    label: "GPU media readiness",
    severity: gpus.status === "fail" ? "critical" : gpus.status === "warn" ? "warning" : "info",
    status: gpus.status === "fail" ? "fail" : gpus.status === "warn" ? "warn" : "ok",
    detail: gpus.detail,
  });

  const overlays = rollupOverlayReadiness(await readOverlayModules());
  checks.push({
    id: "overlay-engine",
    label: "Overlay / graphics engine",
    severity: overlays.status === "fail" ? "critical" : overlays.status === "warn" ? "warning" : "info",
    status: overlays.status === "fail" ? "fail" : overlays.status === "warn" ? "warn" : "ok",
    detail: overlays.detail,
  });

  const obs = await readObservabilityEvents(120);
  const recentCritical = obs.filter((e) => /critical|fail|error|alert/i.test(e.type)).slice(0, 5);
  checks.push({
    id: "critical-events",
    label: "Recent critical events",
    severity: recentCritical.length > 0 ? "warning" : "info",
    status: recentCritical.length > 0 ? "warn" : "ok",
    detail:
      recentCritical.length > 0
        ? recentCritical.map((e) => e.type + "@" + new Date(e.at).toLocaleTimeString()).join(" · ")
        : "No recent critical events",
  });

  const overall = checks.some((c) => c.status === "fail") ? "critical" : checks.some((c) => c.status === "warn") ? "warning" : "ok";
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    overall,
    checks,
    mcrNote: "Local control remains authoritative; this MCR view is supervision and QC.",
  });
}
