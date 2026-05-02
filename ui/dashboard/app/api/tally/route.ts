import { NextResponse } from "next/server";
import { resolveVisionHttpBase } from "../../../lib/visionHttp";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

const FEEDS = ["cam1", "cam2", "cam3"] as const;

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

/** Program / preview tally derived from Vision switcher (for multiview labels, GPIO bridges, etc.). */
export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view") && !hasPermission(user, "switcher.control")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = await resolveVisionHttpBase();
  try {
    const res = await fetch(`${base}/api/switcher`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Vision HTTP ${res.status}`, visionBase: base },
        { status: 502 }
      );
    }
    const body = (await res.json()) as {
      programId?: string;
      previewId?: string;
      tbar?: number;
      revision?: number;
    };
    const programId = String(body.programId ?? "").trim() || "cam1";
    const previewId = String(body.previewId ?? "").trim() || "cam2";

    const tally: Record<string, "program" | "preview" | "idle"> = {};
    for (const id of FEEDS) {
      if (id === programId) tally[id] = "program";
      else if (id === previewId) tally[id] = "preview";
      else tally[id] = "idle";
    }

    return NextResponse.json({
      visionBase: base,
      programId,
      previewId,
      tbar: typeof body.tbar === "number" ? body.tbar : 0,
      revision: typeof body.revision === "number" ? body.revision : 0,
      tally,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "vision unreachable";
    return NextResponse.json({ error: message, visionBase: base }, { status: 502 });
  }
}
