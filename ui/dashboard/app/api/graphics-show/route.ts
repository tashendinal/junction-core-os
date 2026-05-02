import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import {
  cloneBusState,
  emptyBusState,
  mergeBusState,
  normalizeGraphicsDoc,
  readGraphicsShow,
  writeGraphicsShow,
  type GraphicsBusState,
  type GraphicsShowDoc,
} from "../../../lib/graphicsShowStore";
import { recordObservabilityEvent } from "../../../lib/observability";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

function canWriteGraphics(user: ReturnType<typeof parseSessionToken>) {
  return hasPermission(user, "overlay.control") || hasPermission(user, "rack.configure");
}

export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readGraphicsShow();
  return NextResponse.json({
    ...doc,
    canWrite: canWriteGraphics(user),
  });
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!canWriteGraphics(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { canWrite: _strip, ...rest } = raw;
  const body = rest as Partial<GraphicsShowDoc>;
  const prev = await readGraphicsShow();
  const next = normalizeGraphicsDoc({
    ...prev,
    ...body,
    preview:
      body.preview !== undefined
        ? mergeBusState(prev.preview, body.preview as Partial<GraphicsBusState>)
        : prev.preview,
    program:
      body.program !== undefined
        ? mergeBusState(prev.program, body.program as Partial<GraphicsBusState>)
        : prev.program,
    scenePresets: body.scenePresets ?? prev.scenePresets,
    updatedAt: new Date().toISOString(),
  });
  await writeGraphicsShow(next);
  await writeAuditLog(user, {
    action: "graphics-show.update",
    target: "graphics-show.json",
    details: { targetModuleId: next.targetModuleId },
  });
  await recordObservabilityEvent("graphics-show.update", {
    targetModuleId: next.targetModuleId ?? "",
  });
  return NextResponse.json({ success: true, ...next, canWrite: canWriteGraphics(user) });
}

/** Transition helpers — preview/program workflow without external apps. */
export async function POST(req: Request) {
  const user = sessionUser(req);
  if (!canWriteGraphics(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  const cur = await readGraphicsShow();
  let next: GraphicsShowDoc = { ...cur, updatedAt: new Date().toISOString() };

  switch (action) {
    case "take": {
      next.program = cloneBusState(cur.preview);
      await recordObservabilityEvent("graphics-show.take", {
        sceneId: next.program.sceneId,
      });
      break;
    }
    case "cut": {
      next.program = cloneBusState(cur.preview);
      next.preview = emptyBusState();
      await recordObservabilityEvent("graphics-show.cut", {
        sceneId: next.program.sceneId,
      });
      break;
    }
    case "clear_preview": {
      next.preview = emptyBusState();
      await recordObservabilityEvent("graphics-show.clear_preview", {});
      break;
    }
    case "clear_program": {
      next.program = emptyBusState();
      await recordObservabilityEvent("graphics-show.clear_program", {});
      break;
    }
    case "copy_program_to_preview": {
      next.preview = cloneBusState(cur.program);
      await recordObservabilityEvent("graphics-show.copy_program_to_preview", {});
      break;
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  await writeGraphicsShow(next);
  await writeAuditLog(user, {
    action: `graphics-show.${action}`,
    target: "graphics-show.json",
    details: {},
  });
  return NextResponse.json({ success: true, ...next, canWrite: canWriteGraphics(user) });
}
