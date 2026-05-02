import { NextResponse } from "next/server";
import { recordObservabilityEvent } from "../../../../../lib/observability";
import { rejectIfLoginIpBlocked } from "../../../../../lib/remoteAccess";
import { consumePasswordResetToken, updateUserPassword } from "../../../../../lib/userStore";

export async function POST(req: Request) {
  const blocked = await rejectIfLoginIpBlocked(req);
  if (blocked) return blocked;

  let body: { token?: string; newPassword?: string };
  try {
    body = (await req.json()) as { token?: string; newPassword?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim() || "";
  const newPassword = body.newPassword || "";
  if (!token || newPassword.length < 8) {
    return NextResponse.json({ error: "token and newPassword(min 8) required" }, { status: 400 });
  }

  const hit = await consumePasswordResetToken(token);
  if (!hit) {
    return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
  }

  const ok = await updateUserPassword(hit.username, newPassword);
  if (!ok) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await recordObservabilityEvent("auth.password_reset.confirm", { username: hit.username });
  return NextResponse.json({ success: true, username: hit.username });
}
