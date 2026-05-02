import { NextResponse } from "next/server";
import { SESSION_COOKIE, getRolePermissions, parseSessionToken } from "../../../../lib/security";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(cookieToken);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user,
    permissions: getRolePermissions(user.role),
  });
}
