import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { readNodeCommandsStore } from "../../../../lib/nodeCommandsStore";
import { readObservabilityEvents } from "../../../../lib/observability";
import {
  effectiveVisionBase,
  probeHttp,
  readServerConfig,
  readServerServices,
  resolveServiceProbeUrl,
} from "../../../../lib/serverControl";
import { readGpuModules, summarizeGpu } from "../../../../lib/gpuModuleStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

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

  const config = await readServerConfig();
  const visionBase = effectiveVisionBase(config);
  const visionProbe = await probeHttp(`${visionBase}/health`);

  let nodes: Array<{
    nodeId: string;
    thermalC: number;
    diskPct: number;
    updatedAt: string;
    role?: string;
    ip?: string;
  }> = [];
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "node-metrics.json"), "utf8");
    const doc = JSON.parse(raw) as { nodes: typeof nodes };
    nodes = doc.nodes || [];
  } catch {
    nodes = [];
  }

  const staleNodes = nodes.filter((n) => Date.now() - new Date(n.updatedAt).getTime() > 15000).length;
  const cmdStore = await readNodeCommandsStore();
  const queued = cmdStore.commands.filter((c) => c.status === "queued").length;
  const recentFailed = cmdStore.commands.filter((c) => c.status === "failed").slice(-5).reverse();

  const servicesDoc = await readServerServices();
  const servicesResolved = servicesDoc.services.map((s) => ({
    ...s,
    resolvedProbeUrl: resolveServiceProbeUrl(s, config, req),
  }));

  const events = await readObservabilityEvents(12);
  const gpuDoc = await readGpuModules();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    vision: {
      baseUrl: visionBase,
      ok: visionProbe.ok,
      httpStatus: visionProbe.httpStatus,
      detail: visionProbe.detail,
    },
    nodes: {
      count: nodes.length,
      staleCount: staleNodes,
      sample: nodes.slice(0, 8),
    },
    commands: {
      queued,
      recentFailed: recentFailed.map((c) => ({
        id: c.id,
        nodeId: c.nodeId,
        action: c.action,
        result: c.result,
        updatedAt: c.updatedAt,
      })),
    },
    services: servicesResolved,
    gpu: summarizeGpu(gpuDoc),
    observability: events,
    configNotes: config.notes,
  });
}
