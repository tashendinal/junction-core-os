import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";
import { resolveVisionHttpBase } from "../../../../lib/visionHttp";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

/** GET current program/preview bus (Companion / automation). Requires rack.view. */
export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const base = await resolveVisionHttpBase();
  try {
    const res = await fetch(`${base}/api/switcher`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "invalid response from vision" }, { status: 502 });
    }
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "vision unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** PUT switcher state (same JSON fields as WebSocket: programId, previewId, tbar). Requires server.health. */
export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "server.health")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const base = await resolveVisionHttpBase();
  try {
    const res = await fetch(`${base}/api/switcher`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({ error: "invalid response from vision" }));
    return NextResponse.json(out, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "vision unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
