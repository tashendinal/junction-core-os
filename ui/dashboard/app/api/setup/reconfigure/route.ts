import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../../lib/audit";
import { readActivationState, verifyHash } from "../../../../lib/hardwareActivation";
import { SESSION_COOKIE, parseSessionToken } from "../../../../lib/security";

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!user || user.role !== "system_admin") {
    return NextResponse.json({ error: "System admin session required" }, { status: 403 });
  }

  let body: { reconfigToken?: string };
  try {
    body = (await req.json()) as { reconfigToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const state = await readActivationState();
  const provided = body.reconfigToken?.trim() || "";
  if (!verifyHash(provided, state.reconfigTokenHash)) {
    return NextResponse.json({ error: "Invalid reconfigure token" }, { status: 403 });
  }

  await writeAuditLog(user, {
    action: "hardware.reconfigure.authorized",
    target: state.hardwareId || "junction-core-node",
    details: { at: new Date().toISOString() },
  });
  return NextResponse.json({ success: true, mode: "authorized" });
}
