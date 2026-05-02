import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";
import {
  readVideoOutputsDoc,
  writeVideoOutputsDoc,
  type VideoOutputsDoc,
  type VideoOutputSlot,
  type MultiviewLayout,
} from "../../../lib/videoOutputsStore";

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
  const doc = await readVideoOutputsDoc();
  return NextResponse.json(doc);
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<Pick<VideoOutputsDoc, "outputs" | "multiviewLayouts">>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prev = await readVideoOutputsDoc();
  const next: VideoOutputsDoc = {
    updatedAt: new Date().toISOString(),
    outputs: Array.isArray(body.outputs) ? (body.outputs as VideoOutputSlot[]) : prev.outputs,
    multiviewLayouts: Array.isArray(body.multiviewLayouts)
      ? (body.multiviewLayouts as MultiviewLayout[])
      : prev.multiviewLayouts,
  };
  await writeVideoOutputsDoc(next);
  await writeAuditLog(user, {
    action: "video-outputs.update",
    target: "video-outputs.json",
    details: { outputCount: next.outputs.length, layoutCount: next.multiviewLayouts.length },
  });
  await recordObservabilityEvent("video-outputs.update", { user: user?.username });
  return NextResponse.json({ success: true, doc: next });
}
