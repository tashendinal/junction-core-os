import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import {
  enqueueNodeCommand,
  type NodeAction,
  patchNodeCommandStatus,
  pollQueuedCommandForAgent,
  readNodeCommandsStore,
} from "../../../lib/nodeCommandsStore";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

function isAgentAuthorized(req: Request): boolean {
  const key = req.headers.get("x-junction-agent-key");
  const expected = process.env.JUNCTION_AGENT_KEY || "junction-agent-dev-key";
  return key === expected;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const agentMode = url.searchParams.get("agent") === "1";
  if (agentMode) {
    if (!isAgentAuthorized(req)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json({ error: "nodeId is required for agent mode" }, { status: 400 });
    }
    const cmd = await pollQueuedCommandForAgent(nodeId);
    return NextResponse.json({ command: cmd || null });
  }

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
  const store = await readNodeCommandsStore();
  return NextResponse.json({
    updatedAt: store.updatedAt,
    commands: store.commands.slice(-100).reverse(),
  });
}

export async function PATCH(req: Request) {
  if (!isAgentAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { commandId?: string; status?: "queued" | "acknowledged" | "completed" | "failed"; result?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.commandId || !body.status) {
    return NextResponse.json({ error: "commandId and status are required" }, { status: 400 });
  }
  const ok = await patchNodeCommandStatus(body.commandId, body.status, body.result);
  if (!ok) {
    return NextResponse.json({ error: "command not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, "server.maintenance")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { nodeId?: string; action?: NodeAction };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.nodeId || !body.action) {
    return NextResponse.json({ error: "nodeId and action are required" }, { status: 400 });
  }

  const command = await enqueueNodeCommand({
    nodeId: body.nodeId,
    action: body.action,
    createdBy: user?.username || "unknown",
  });

  await writeAuditLog(user, {
    action: "node.command.dispatch",
    target: body.nodeId,
    details: { commandId: command.id, nodeAction: command.action },
  });
  await recordObservabilityEvent("node.command.dispatch", {
    nodeId: body.nodeId,
    commandId: command.id,
    action: command.action,
  });

  return NextResponse.json({ success: true, command });
}
