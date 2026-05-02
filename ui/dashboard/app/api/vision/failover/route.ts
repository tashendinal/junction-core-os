import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../../lib/audit";
import { recordObservabilityEvent } from "../../../../lib/observability";
import {
  effectiveVisionBase,
  readServerConfig,
  writeServerConfig,
  type ServerConfigDoc,
} from "../../../../lib/serverControl";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

/**
 * Promote standby Vision HTTP base to primary; previous primary becomes standby.
 * Requires standbyVisionHttpUrl in server config.
 */
export async function POST(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cfg = await readServerConfig();
  const standbyRaw = cfg.standbyVisionHttpUrl?.trim();
  if (!standbyRaw) {
    return NextResponse.json(
      { error: "No standby Vision URL configured. Set standbyVisionHttpUrl in Server control." },
      { status: 400 }
    );
  }

  const primaryNow = effectiveVisionBase(cfg).replace(/\/$/, "");
  const standby = standbyRaw.replace(/\/$/, "");
  if (standby === primaryNow) {
    return NextResponse.json({ error: "Standby URL matches primary; nothing to failover." }, { status: 400 });
  }

  const next: ServerConfigDoc = {
    ...cfg,
    updatedAt: new Date().toISOString(),
    visionHttpUrl: standby,
    standbyVisionHttpUrl: primaryNow,
  };

  await writeServerConfig(next);
  await writeAuditLog(user, {
    action: "vision.failover.swap",
    target: "server-config.json",
    details: { newPrimary: standby, newStandby: next.standbyVisionHttpUrl },
  });
  await recordObservabilityEvent("vision.failover.swap", {
    user: user?.username,
    newPrimary: standby,
  });

  return NextResponse.json({
    success: true,
    config: {
      visionHttpUrl: next.visionHttpUrl,
      standbyVisionHttpUrl: next.standbyVisionHttpUrl,
    },
  });
}
