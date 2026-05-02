import { NextResponse } from "next/server";
import { computeFacilityTimecode } from "../../../lib/timecode";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

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

  const now = Date.now();
  const tc = computeFacilityTimecode(now);
  return NextResponse.json({
    generatedAt: new Date(now).toISOString(),
    serverNowMs: now,
    timecode: tc.timecode,
    fps: tc.fps,
    epochMs: tc.epochMs,
    source: tc.source,
    /** PTP/LTC hardware sync can set JUNCTION_TIMECODE_SOURCE=ptp in future; today always wall. */
    syncHint: process.env.JUNCTION_TIMECODE_SOURCE === "ptp" ? "ptp_claimed" : "facility_wall_clock",
  });
}
