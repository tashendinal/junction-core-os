import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import {
  computeProgress,
  readChecklistDoc,
  readSessionDoc,
  writeSessionDoc,
  type OnAirMode,
  type OnAirSessionDoc,
} from "../../../lib/onAirStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

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
  const checklist = await readChecklistDoc();
  const session = await readSessionDoc();
  const progress = computeProgress(checklist, session);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    checklist,
    session,
    progress,
  });
}

export async function POST(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "server.health")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    action?: "toggle" | "setMode" | "setShowLabel" | "setNote" | "reset" | "clearItem";
    itemId?: string;
    mode?: OnAirMode;
    showLabel?: string;
    note?: string;
    checked?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const checklist = await readChecklistDoc();
  const ids = new Set(checklist.items.map((i) => i.id));
  let session = await readSessionDoc();

  const touch = (doc: OnAirSessionDoc): OnAirSessionDoc => ({
    ...doc,
    updatedAt: new Date().toISOString(),
  });

  if (body.action === "reset") {
    session = touch({
      ...session,
      mode: "preflight",
      items: {},
      showLabel: "",
    });
    await writeSessionDoc(session);
    await recordObservabilityEvent("on-air.reset", { user: u?.username });
    await writeAuditLog(u, { action: "on-air.reset", target: "session", details: {} });
    return NextResponse.json({ success: true, session, progress: computeProgress(checklist, session) });
  }

  if (body.action === "setShowLabel") {
    session = touch({ ...session, showLabel: String(body.showLabel ?? "").slice(0, 120) });
    await writeSessionDoc(session);
    return NextResponse.json({ success: true, session, progress: computeProgress(checklist, session) });
  }

  if (body.action === "setMode") {
    const mode = body.mode;
    if (!mode || !["preflight", "rehearsal", "live"].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    const progress = computeProgress(checklist, session);
    if (mode === "live" && !progress.canGoLive) {
      return NextResponse.json(
        { error: "Required checklist items not complete for LIVE", progress },
        { status: 409 }
      );
    }
    session = touch({ ...session, mode });
    await writeSessionDoc(session);
    await recordObservabilityEvent("on-air.mode", { user: u?.username, mode });
    await writeAuditLog(u, { action: "on-air.mode", target: mode, details: { showLabel: session.showLabel } });
    return NextResponse.json({ success: true, session, progress: computeProgress(checklist, session) });
  }

  if (body.action === "toggle" && body.itemId) {
    if (!ids.has(body.itemId)) {
      return NextResponse.json({ error: "Unknown item" }, { status: 400 });
    }
    const prev = session.items[body.itemId]?.checked ?? false;
    const checked = body.checked !== undefined ? Boolean(body.checked) : !prev;
    const nextItems = {
      ...session.items,
      [body.itemId]: {
        checked,
        at: new Date().toISOString(),
        by: u?.username || "unknown",
        note: session.items[body.itemId]?.note,
      },
    };
    session = touch({ ...session, items: nextItems });
    await writeSessionDoc(session);
    return NextResponse.json({ success: true, session, progress: computeProgress(checklist, session) });
  }

  if (body.action === "setNote" && body.itemId) {
    if (!ids.has(body.itemId)) {
      return NextResponse.json({ error: "Unknown item" }, { status: 400 });
    }
    const note = String(body.note ?? "").slice(0, 500);
    const prev = session.items[body.itemId] || { checked: false };
    session = touch({
      ...session,
      items: {
        ...session.items,
        [body.itemId]: { ...prev, note },
      },
    });
    await writeSessionDoc(session);
    return NextResponse.json({ success: true, session, progress: computeProgress(checklist, session) });
  }

  if (body.action === "clearItem" && body.itemId) {
    const next = { ...session.items };
    delete next[body.itemId];
    session = touch({ ...session, items: next });
    await writeSessionDoc(session);
    return NextResponse.json({ success: true, session, progress: computeProgress(checklist, session) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
