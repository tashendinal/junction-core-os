import { NextResponse } from "next/server";
import { recordObservabilityEvent } from "../../../../../lib/observability";
import { rejectIfLoginIpBlocked } from "../../../../../lib/remoteAccess";
import { createPasswordResetToken, publicUsers, readUsers } from "../../../../../lib/userStore";

export async function POST(req: Request) {
  const blocked = await rejectIfLoginIpBlocked(req);
  if (blocked) return blocked;

  let body: { username?: string };
  try {
    body = (await req.json()) as { username?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim() || "";
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  const users = publicUsers(await readUsers());
  const exists = users.find((u) => u.username === username && u.active);
  if (!exists) {
    return NextResponse.json({ success: true, message: "If account exists, reset token is generated." });
  }

  const token = await createPasswordResetToken(username);
  await recordObservabilityEvent("auth.password_reset.request", { username });
  return NextResponse.json({
    success: true,
    message: "Password reset token generated.",
    resetToken: token,
    note:
      "Use this token in login page reset form. In production, wire this to email/SMS delivery and hide token from API response.",
  });
}
