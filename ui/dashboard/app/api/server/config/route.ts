import { NextResponse } from "next/server";
import { recordObservabilityEvent } from "../../../../lib/observability";
import { readServerConfig, writeServerConfig, type ServerConfigDoc } from "../../../../lib/serverControl";
import { writeAuditLog } from "../../../../lib/audit";
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

export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readServerConfig();
  return NextResponse.json(doc);
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<
    Pick<
      ServerConfigDoc,
      | "visionHttpUrl"
      | "notes"
      | "standbyDashboardUrl"
      | "standbyVisionHttpUrl"
      | "standbyProcedureNotes"
      | "remoteAccessMode"
      | "allowedLoginCidrs"
      | "requireRemoteCode"
      | "operatorProfileMode"
      | "singleVendorProfile"
    >
  >;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prev = await readServerConfig();
  const next: ServerConfigDoc = {
    ...prev,
    updatedAt: new Date().toISOString(),
    visionHttpUrl:
      body.visionHttpUrl === undefined
        ? prev.visionHttpUrl
        : body.visionHttpUrl === "" || body.visionHttpUrl === null
          ? null
          : String(body.visionHttpUrl).trim(),
    notes: body.notes !== undefined ? String(body.notes) : prev.notes,
    standbyDashboardUrl:
      body.standbyDashboardUrl === undefined
        ? prev.standbyDashboardUrl
        : body.standbyDashboardUrl === null || body.standbyDashboardUrl === ""
          ? null
          : String(body.standbyDashboardUrl).trim(),
    standbyVisionHttpUrl:
      body.standbyVisionHttpUrl === undefined
        ? prev.standbyVisionHttpUrl
        : body.standbyVisionHttpUrl === null || body.standbyVisionHttpUrl === ""
          ? null
          : String(body.standbyVisionHttpUrl).trim(),
    standbyProcedureNotes:
      body.standbyProcedureNotes === undefined
        ? prev.standbyProcedureNotes
        : body.standbyProcedureNotes === null || body.standbyProcedureNotes === ""
          ? null
          : String(body.standbyProcedureNotes),
    remoteAccessMode:
      body.remoteAccessMode === undefined
        ? prev.remoteAccessMode
        : body.remoteAccessMode === "secure_remote"
          ? "secure_remote"
          : "lan_only",
    allowedLoginCidrs:
      body.allowedLoginCidrs === undefined
        ? prev.allowedLoginCidrs
        : Array.isArray(body.allowedLoginCidrs)
          ? body.allowedLoginCidrs.map((x) => String(x).trim()).filter(Boolean)
          : prev.allowedLoginCidrs,
    requireRemoteCode:
      body.requireRemoteCode === undefined ? prev.requireRemoteCode : Boolean(body.requireRemoteCode),
    operatorProfileMode:
      body.operatorProfileMode === undefined
        ? prev.operatorProfileMode
        : body.operatorProfileMode === "single_vendor_operator"
          ? "single_vendor_operator"
          : "multi_vendor_software_defined",
    singleVendorProfile:
      body.singleVendorProfile === undefined
        ? prev.singleVendorProfile
        : body.singleVendorProfile === "sony_stack" ||
            body.singleVendorProfile === "blackmagic_style" ||
            body.singleVendorProfile === "custom"
          ? body.singleVendorProfile
          : null,
  };
  await writeServerConfig(next);
  await writeAuditLog(user, {
    action: "server.config.update",
    target: "server-config.json",
    details: { visionHttpUrl: next.visionHttpUrl },
  });
  await recordObservabilityEvent("server.config.update", {
    user: user?.username,
    visionHttpUrl: next.visionHttpUrl,
  });
  return NextResponse.json({ success: true, config: next });
}
