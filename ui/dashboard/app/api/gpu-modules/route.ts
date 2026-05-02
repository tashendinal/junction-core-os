import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import {
  readGpuModules,
  removeGpuModule,
  summarizeGpu,
  syncDiscoveredGpusFromNodeMetrics,
  type GpuModule,
  type GpuModulesDoc,
  writeGpuModules,
} from "../../../lib/gpuModuleStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readGpuModules();
  return NextResponse.json({
    ...doc,
    summary: summarizeGpu(doc),
    generatedAt: new Date().toISOString(),
  });
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<Pick<GpuModulesDoc, "modules" | "workflowPolicy">>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.modules) || !body.workflowPolicy) {
    return NextResponse.json({ error: "modules[] and workflowPolicy required" }, { status: 400 });
  }
  const next: GpuModulesDoc = {
    updatedAt: new Date().toISOString(),
    modules: body.modules as GpuModule[],
    workflowPolicy: body.workflowPolicy as GpuModulesDoc["workflowPolicy"],
  };
  await writeGpuModules(next);
  await writeAuditLog(user, {
    action: "gpu-modules.update",
    target: "gpu-modules.json",
    details: summarizeGpu(next),
  });
  await recordObservabilityEvent("gpu-modules.update", summarizeGpu(next));
  return NextResponse.json({ success: true, ...next, summary: summarizeGpu(next) });
}

export async function POST(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { action?: "sync_discovered" | "remove_module"; moduleId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const doc = await readGpuModules();
  if (body.action === "sync_discovered") {
    const { next, added } = await syncDiscoveredGpusFromNodeMetrics(doc);
    await writeGpuModules(next);
    await writeAuditLog(user, {
      action: "gpu-modules.sync_discovered",
      target: "gpu-modules.json",
      details: { added, ...summarizeGpu(next) },
    });
    await recordObservabilityEvent("gpu-modules.sync_discovered", { added, ...summarizeGpu(next) });
    return NextResponse.json({ success: true, added, ...next, summary: summarizeGpu(next) });
  }
  if (body.action === "remove_module" && body.moduleId) {
    const next = removeGpuModule(doc, body.moduleId);
    await writeGpuModules(next);
    await writeAuditLog(user, {
      action: "gpu-modules.remove_module",
      target: body.moduleId,
      details: summarizeGpu(next),
    });
    await recordObservabilityEvent("gpu-modules.remove_module", {
      moduleId: body.moduleId,
      ...summarizeGpu(next),
    });
    return NextResponse.json({ success: true, ...next, summary: summarizeGpu(next) });
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
