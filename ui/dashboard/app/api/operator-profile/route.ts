import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";
import { readServerConfig } from "../../../lib/serverControl";

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
  const cfg = await readServerConfig();
  return NextResponse.json({
    operatorProfileMode: cfg.operatorProfileMode,
    singleVendorProfile: cfg.singleVendorProfile,
    generatedAt: new Date().toISOString(),
  });
}
