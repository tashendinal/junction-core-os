import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../../lib/audit";
import { enqueueNodeCommand } from "../../../../lib/nodeCommandsStore";
import { recordObservabilityEvent } from "../../../../lib/observability";
import {
  probeHttp,
  readServerConfig,
  readServerServices,
  resolveServiceProbeUrl,
  updateServiceProbeResult,
  writeServerServices,
  type ServerServicesDoc,
} from "../../../../lib/serverControl";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

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
  const config = await readServerConfig();
  const doc = await readServerServices();
  return NextResponse.json({
    ...doc,
    services: doc.services.map((s) => ({
      ...s,
      resolvedProbeUrl: resolveServiceProbeUrl(s, config, req),
    })),
  });
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { services?: ServerServicesDoc["services"] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.services || !Array.isArray(body.services)) {
    return NextResponse.json({ error: "services array required" }, { status: 400 });
  }
  const next: ServerServicesDoc = {
    updatedAt: new Date().toISOString(),
    services: body.services,
  };
  await writeServerServices(next);
  await writeAuditLog(user, {
    action: "server.services.update",
    target: "server-services.json",
    details: { count: next.services.length },
  });
  await recordObservabilityEvent("server.services.update", { count: next.services.length });
  return NextResponse.json({ success: true, services: next.services });
}

export async function POST(req: Request) {
  const user = sessionUser(req);
  let body: {
    action?: "probe" | "probe_all" | "orchestrate";
    serviceId?: string;
    nodeId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const config = await readServerConfig();
  const doc = await readServerServices();

  if (action === "probe" || action === "probe_all") {
    if (!hasPermission(user, "server.health")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const targets =
      action === "probe" && body.serviceId
        ? doc.services.filter((s) => s.id === body.serviceId)
        : doc.services;
    const cookie = req.headers.get("cookie");
    const forwardCookie: RequestInit | undefined = cookie ? { headers: { cookie } } : undefined;
    const results: Array<{ id: string; ok: boolean; detail: string; httpStatus?: number }> = [];
    for (const s of targets) {
      const url = resolveServiceProbeUrl(s, config, req);
      if (!url) {
        results.push({ id: s.id, ok: false, detail: "No probe URL for this service" });
        continue;
      }
      const r = await probeHttp(url, 3500, s.id === "dashboard" ? forwardCookie : undefined);
      results.push({ id: s.id, ok: r.ok, detail: r.detail, httpStatus: r.httpStatus });
      await updateServiceProbeResult(s.id, r);
    }
    await recordObservabilityEvent("server.services.probe", { action, results: results.map((r) => r.id) });
    return NextResponse.json({ success: true, results });
  }

  if (action === "orchestrate") {
    if (!hasPermission(user, "server.maintenance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!body.serviceId) {
      return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
    }
    const svc = doc.services.find((s) => s.id === body.serviceId);
    if (!svc || !svc.orchestrateAction) {
      return NextResponse.json({ error: "Service not orchestratable" }, { status: 400 });
    }
    const nodeId = body.nodeId?.trim() || svc.defaultNodeId;
    if (!nodeId) {
      return NextResponse.json({ error: "nodeId required (no default on service)" }, { status: 400 });
    }
    const command = await enqueueNodeCommand({
      nodeId,
      action: svc.orchestrateAction,
      createdBy: user?.username || "unknown",
    });
    await writeAuditLog(user, {
      action: "server.services.orchestrate",
      target: svc.id,
      details: { commandId: command.id, nodeId, action: svc.orchestrateAction },
    });
    await recordObservabilityEvent("server.services.orchestrate", {
      serviceId: svc.id,
      nodeId,
      commandId: command.id,
      nodeAction: svc.orchestrateAction,
    });
    return NextResponse.json({ success: true, command });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
