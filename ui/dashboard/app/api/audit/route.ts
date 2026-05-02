import { NextResponse } from "next/server";
import { readAuditLogEntries, writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type Body = {
  action?: string;
  target?: string;
  details?: Record<string, unknown>;
};

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(cookieToken);
  if (!hasPermission(user, "server.health")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 150));
  const entries = await readAuditLogEntries(limit);
  return NextResponse.json({ generatedAt: new Date().toISOString(), entries });
}

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(cookieToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || !body.target) {
    return NextResponse.json({ error: "action and target are required" }, { status: 400 });
  }

  await writeAuditLog(user, {
    action: body.action,
    target: body.target,
    details: body.details || {},
  });
  return NextResponse.json({ success: true });
}
