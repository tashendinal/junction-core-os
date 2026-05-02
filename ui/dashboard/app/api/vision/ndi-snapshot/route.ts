import { NextResponse } from "next/server";
import { resolveVisionHttpBase } from "../../../../lib/visionHttp";

/** One-shot NDI discovery list from Vision (direct Ethernet / LAN cameras). */
export async function GET() {
  const base = await resolveVisionHttpBase();
  try {
    const res = await fetch(`${base}/ndi/snapshot`, { cache: "no-store" });
    const body = await res.json().catch(() => ({ error: "invalid json from vision" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "vision unreachable";
    return NextResponse.json({ error: message, visionBase: base, sources: [] }, { status: 502 });
  }
}
