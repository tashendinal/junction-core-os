import { NextResponse } from "next/server";
import { readObservabilityEvents } from "../../../../lib/observability";
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
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "80", 10)));
  const events = await readObservabilityEvents(limit);
  return NextResponse.json({ generatedAt: new Date().toISOString(), events });
}
