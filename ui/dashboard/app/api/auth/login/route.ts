import { NextResponse } from "next/server";
import { readActivationState } from "../../../../lib/hardwareActivation";
import { recordObservabilityEvent } from "../../../../lib/observability";
import { isRemoteLoginAllowed, LOGIN_IP_FORBIDDEN_MESSAGE, requestIp } from "../../../../lib/remoteAccess";
import { SESSION_COOKIE, createSessionToken, getRolePermissions, validateCredentials } from "../../../../lib/security";
import { readServerConfig } from "../../../../lib/serverControl";
import { authenticateUser } from "../../../../lib/userStore";

export async function POST(req: Request) {
  const activation = await readActivationState();
  if (!activation.activated) {
    return NextResponse.json({ error: "System not activated. Complete hardware setup first at /setup." }, { status: 403 });
  }

  let body: { username?: string; password?: string; remoteCode?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim() || "";
  const password = body.password || "";
  const cfg = await readServerConfig();
  if (!isRemoteLoginAllowed(req, cfg)) {
    return NextResponse.json({ error: LOGIN_IP_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  if (cfg.remoteAccessMode === "secure_remote" && cfg.requireRemoteCode) {
    const expected = process.env.DASHBOARD_REMOTE_ACCESS_CODE || "";
    if (!expected || body.remoteCode !== expected) {
      return NextResponse.json({ error: "Remote access code required" }, { status: 403 });
    }
  }
  const user = (await authenticateUser(username, password)) || validateCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = createSessionToken(user);
  const response = NextResponse.json({
    success: true,
    user,
    permissions: getRolePermissions(user.role),
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  await recordObservabilityEvent("auth.login", {
    username: user.username,
    role: user.role,
    ip: requestIp(req) || "unknown",
    remoteAccessMode: cfg.remoteAccessMode,
  });
  return response;
}
