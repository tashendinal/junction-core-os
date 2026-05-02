import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { readActivationState, writeActivationState, hashSecret, verifyHash } from "../../../lib/hardwareActivation";
import { SESSION_COOKIE, createSessionToken, parseSessionToken, validateCredentials } from "../../../lib/security";

export async function GET() {
  const state = await readActivationState();
  return NextResponse.json({
    activated: state.activated,
    activatedAt: state.activatedAt,
    hardwareId: state.hardwareId,
    entitlements: state.entitlements,
  });
}

export async function POST(req: Request) {
  let body: {
    action?: "activate" | "enable_reconfigure";
    username?: string;
    password?: string;
    hardwareId?: string;
    activationCode?: string;
    reconfigToken?: string;
    entitlements?: { ndiMaxChannels?: number | null };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const state = await readActivationState();

  if (body.action === "activate") {
    if (state.activated) {
      return NextResponse.json({ error: "System already activated" }, { status: 409 });
    }
    const user = validateCredentials(body.username?.trim() || "", body.password || "");
    if (!user || user.role !== "system_admin") {
      return NextResponse.json({ error: "System admin credentials required" }, { status: 403 });
    }
    const code = body.activationCode?.trim() || "";
    if (code.length < 8) {
      return NextResponse.json({ error: "Activation code must be at least 8 chars" }, { status: 400 });
    }
    const nextEntitlements = { ...state.entitlements };
    if (body.entitlements && Object.prototype.hasOwnProperty.call(body.entitlements, "ndiMaxChannels")) {
      const v = body.entitlements.ndiMaxChannels;
      if (v === null) {
        nextEntitlements.ndiMaxChannels = null;
      } else if (typeof v === "number" && v > 0) {
        nextEntitlements.ndiMaxChannels = Math.floor(v);
      }
    }
    const next = {
      ...state,
      activated: true,
      activatedAt: new Date().toISOString(),
      activatedBy: user.username,
      hardwareId: body.hardwareId?.trim() || "junction-core-node",
      activationCodeHash: hashSecret(code),
      entitlements: nextEntitlements,
    };
    await writeActivationState(next);
    await writeAuditLog(user, {
      action: "hardware.activation.complete",
      target: next.hardwareId || "junction-core-node",
      details: { activatedAt: next.activatedAt },
    });
    const token = createSessionToken(user);
    const response = NextResponse.json({ success: true, activated: true });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  if (body.action === "enable_reconfigure") {
    const cookie = req.headers.get("cookie") || "";
    const token = cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")[1];
    const sessionUser = parseSessionToken(token);
    if (!sessionUser || sessionUser.role !== "system_admin") {
      return NextResponse.json({ error: "System admin session required" }, { status: 403 });
    }
    const code = body.activationCode?.trim() || "";
    if (!verifyHash(code, state.activationCodeHash)) {
      return NextResponse.json({ error: "Invalid activation code" }, { status: 403 });
    }
    const reToken = body.reconfigToken?.trim() || "";
    if (reToken.length < 8) {
      return NextResponse.json({ error: "Reconfigure token must be at least 8 chars" }, { status: 400 });
    }
    const next = {
      ...state,
      reconfigTokenHash: hashSecret(reToken),
      reconfigEnabledAt: new Date().toISOString(),
    };
    await writeActivationState(next);
    await writeAuditLog(sessionUser, {
      action: "hardware.reconfigure.enabled",
      target: state.hardwareId || "junction-core-node",
      details: { enabledAt: next.reconfigEnabledAt },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
