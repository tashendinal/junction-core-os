import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../../lib/audit";
import { recordObservabilityEvent } from "../../../../lib/observability";
import { collectIsoRecorderBases, probeIsoRecorderHealth } from "../../../../lib/isoRecorderProbe";
import {
  readRecordingRack,
  readRecordingSessions,
  upsertSession,
  writeRecordingSessions,
} from "../../../../lib/recordingRackStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

function user(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

async function callIsoStart(base: string, sessionKey: string, outputPath: string, profile: string) {
  const url = `${base.replace(/\/$/, "")}/record/start`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionKey, outputPath, profile }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function callIsoStop(base: string, sessionKey: string) {
  const url = `${base.replace(/\/$/, "")}/record/stop`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionKey }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function GET(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [rack, sessions] = await Promise.all([readRecordingRack(), readRecordingSessions()]);
  const bases = collectIsoRecorderBases(rack);
  const agentHealth: Record<string, { ok: boolean; detail: string; body?: Record<string, unknown> }> = {};
  await Promise.all(
    bases.map(async (base) => {
      const r = await probeIsoRecorderHealth(base);
      agentHealth[base] = { ok: r.ok, detail: r.detail, body: r.body as Record<string, unknown> | undefined };
    })
  );
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    rack,
    sessions,
    agentHealth,
  });
}

export async function POST(req: Request) {
  const u = user(req);
  if (!hasPermission(u, "server.health")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    action?: "start" | "stop";
    moduleId?: string;
    tier?: "primary" | "backup";
    profile?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || !body.moduleId) {
    return NextResponse.json({ error: "action and moduleId required" }, { status: 400 });
  }

  const rack = await readRecordingRack();
  const mod = rack.modules.find((m) => m.id === body.moduleId);
  if (!mod) {
    return NextResponse.json({ error: "Unknown module" }, { status: 404 });
  }
  if (mod.kind !== "iso_recorder") {
    return NextResponse.json(
      { error: "Only iso_recorder modules can be started from this API (use hardware for playback decks)." },
      { status: 400 }
    );
  }

  const tier = body.tier === "backup" ? "backup" : "primary";
  const base =
    tier === "backup" ? mod.backupRecorderBase || mod.primaryRecorderBase : mod.primaryRecorderBase;
  if (!base) {
    return NextResponse.json(
      { error: "No recorder HTTP base configured for this tier — set primaryRecorderBase / backupRecorderBase." },
      { status: 400 }
    );
  }

  const sessionKey = `${mod.id}-${tier}`;
  let sessions = await readRecordingSessions();

  if (body.action === "start") {
    const dir = mod.outputDir.replace(/\/+$/, "").replace(/\.\./g, "");
    const profile = body.profile || "demo";
    const ext =
      profile === "prores_demo" || profile === "prores" ? "mov" : "mp4";
    const outputPath = `${dir}/junction-${Date.now()}.${ext}`;
    const result = await callIsoStart(base, sessionKey, outputPath, profile);
    if (!result.ok) {
      sessions = upsertSession(sessions, {
        moduleId: mod.id,
        tier,
        state: "error",
        lastError: result.text.slice(0, 500),
        startedAt: null,
      });
      await writeRecordingSessions(sessions);
      return NextResponse.json(
        { error: "Recorder agent failed", detail: result.json || result.text, httpStatus: result.status },
        { status: 502 }
      );
    }
    sessions = upsertSession(sessions, {
      moduleId: mod.id,
      tier,
      state: "recording",
      lastError: null,
      startedAt: new Date().toISOString(),
    });
    await writeRecordingSessions(sessions);
    await writeAuditLog(u, {
      action: "recording.start",
      target: mod.id,
      details: { tier, sessionKey, outputPath, profile },
    });
    await recordObservabilityEvent("recording.start", { moduleId: mod.id, tier, sessionKey });
    return NextResponse.json({ success: true, sessionKey, outputPath, recorder: result.json });
  }

  if (body.action === "stop") {
    const result = await callIsoStop(base, sessionKey);
    sessions = upsertSession(sessions, {
      moduleId: mod.id,
      tier,
      state: result.ok ? "idle" : "error",
      lastError: result.ok ? null : result.text.slice(0, 500),
      startedAt: null,
    });
    await writeRecordingSessions(sessions);
    await writeAuditLog(u, {
      action: "recording.stop",
      target: mod.id,
      details: { tier, sessionKey, httpStatus: result.status },
    });
    await recordObservabilityEvent("recording.stop", { moduleId: mod.id, tier, sessionKey });
    if (!result.ok) {
      return NextResponse.json({ error: "Recorder stop failed", detail: result.text }, { status: 502 });
    }
    return NextResponse.json({ success: true, sessionKey });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
