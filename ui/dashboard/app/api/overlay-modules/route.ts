import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import { readOverlayModules, type OverlayModulesDoc, writeOverlayModules } from "../../../lib/overlayModuleStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

function user(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

export async function GET(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "rack.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await readOverlayModules());
}

export async function PUT(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "rack.configure")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Partial<OverlayModulesDoc>;
  try {
    body = (await req.json()) as Partial<OverlayModulesDoc>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.modules) || !body.policy) {
    return NextResponse.json({ error: "modules[] and policy required" }, { status: 400 });
  }
  const next: OverlayModulesDoc = {
    updatedAt: new Date().toISOString(),
    modules: body.modules,
    policy: body.policy,
  };
  await writeOverlayModules(next);
  await writeAuditLog(u, {
    action: "overlay-modules.update",
    target: "overlay-modules.json",
    details: { count: next.modules.length },
  });
  await recordObservabilityEvent("overlay-modules.update", { count: next.modules.length });
  return NextResponse.json({ success: true, ...next });
}
