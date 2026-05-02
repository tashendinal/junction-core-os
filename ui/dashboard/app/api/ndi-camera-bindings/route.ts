import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import { readNdiCameraBindingsDoc, writeNdiCameraBindingsDoc } from "../../../lib/ndiCameraBindingsStore";
import type { NdiCameraBindingsDoc } from "../../../lib/ndiCameraBindingsTypes";
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
  const doc = await readNdiCameraBindingsDoc();
  return NextResponse.json(doc);
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure") && !hasPermission(user, "camera.control")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<Pick<NdiCameraBindingsDoc, "bindings">>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prev = await readNdiCameraBindingsDoc();
  const next: NdiCameraBindingsDoc = {
    updatedAt: new Date().toISOString(),
    bindings: Array.isArray(body.bindings) ? body.bindings : prev.bindings,
  };
  await writeNdiCameraBindingsDoc(next);
  await writeAuditLog(user, {
    action: "ndi-camera-bindings.update",
    target: "ndi-camera-bindings.json",
    details: { slots: next.bindings.length },
  });
  await recordObservabilityEvent("ndi-camera-bindings.update", { user: user?.username });
  return NextResponse.json({ success: true, doc: next });
}
