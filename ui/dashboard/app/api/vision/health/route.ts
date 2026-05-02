import { NextResponse } from "next/server";
import { resolveVisionHttpBase } from "../../../../lib/visionHttp";

/** Proxies vision `/health` for same-origin dashboard calls (no CORS). */
export async function GET() {
  const base = await resolveVisionHttpBase();
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    const body = await res.json().catch(() => ({ error: "invalid json from vision" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "vision unreachable";
    return NextResponse.json({ error: message, visionBase: base }, { status: 502 });
  }
}
