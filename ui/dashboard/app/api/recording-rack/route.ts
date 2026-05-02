import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import { readRecordingRack, writeRecordingRack, type RecordingRackDoc } from "../../../lib/recordingRackStore";
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
  if (!hasPermission(u, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readRecordingRack();
  return NextResponse.json(doc);
}

export async function PUT(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { modules?: RecordingRackDoc["modules"] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.modules || !Array.isArray(body.modules)) {
    return NextResponse.json({ error: "modules array required" }, { status: 400 });
  }
  const next: RecordingRackDoc = {
    updatedAt: new Date().toISOString(),
    modules: body.modules,
  };
  await writeRecordingRack(next);
  await writeAuditLog(u, {
    action: "recording-rack.update",
    target: "recording-rack.json",
    details: { count: next.modules.length },
  });
  await recordObservabilityEvent("recording-rack.update", { count: next.modules.length });
  return NextResponse.json({ success: true, ...next });
}
