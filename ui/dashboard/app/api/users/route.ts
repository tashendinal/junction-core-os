import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, parseSessionToken } from "../../../lib/security";
import { hashPassword, publicUsers, readUsers, writeUsers } from "../../../lib/userStore";

function ensureSystemAdmin(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!user || user.role !== "system_admin") return null;
  return user;
}

export async function GET(req: Request) {
  const actor = ensureSystemAdmin(req);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const doc = await readUsers();
  return NextResponse.json({ users: publicUsers(doc) });
}

export async function POST(req: Request) {
  const actor = ensureSystemAdmin(req);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    username?: string;
    displayName?: string;
    role?:
      | "system_admin"
      | "live_production"
      | "camera_operator"
      | "audio_engineer"
      | "switcher_operator"
      | "viewer";
    password?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim() || "";
  const displayName = body.displayName?.trim() || "";
  const role = body.role;
  const password = body.password || "";
  if (!username || !displayName || !role || password.length < 8) {
    return NextResponse.json({ error: "username, displayName, role and password(min 8) are required" }, { status: 400 });
  }

  const doc = await readUsers();
  if (doc.users.some((u) => u.username === username)) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }
  const now = new Date().toISOString();
  doc.users.push({
    username,
    displayName,
    role,
    passwordHash: hashPassword(password),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  doc.updatedAt = now;
  await writeUsers(doc);
  await writeAuditLog(actor, {
    action: "users.create",
    target: username,
    details: { role },
  });
  return NextResponse.json({ success: true, users: publicUsers(doc) });
}

export async function PATCH(req: Request) {
  const actor = ensureSystemAdmin(req);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: {
    username?: string;
    displayName?: string;
    role?:
      | "system_admin"
      | "live_production"
      | "camera_operator"
      | "audio_engineer"
      | "switcher_operator"
      | "viewer";
    password?: string;
    active?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.username) return NextResponse.json({ error: "username is required" }, { status: 400 });

  const doc = await readUsers();
  const idx = doc.users.findIndex((u) => u.username === body.username);
  if (idx < 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const prev = doc.users[idx];
  doc.users[idx] = {
    ...prev,
    displayName: body.displayName?.trim() || prev.displayName,
    role: body.role || prev.role,
    active: typeof body.active === "boolean" ? body.active : prev.active,
    passwordHash: body.password && body.password.length >= 8 ? hashPassword(body.password) : prev.passwordHash,
    updatedAt: new Date().toISOString(),
  };
  doc.updatedAt = new Date().toISOString();
  await writeUsers(doc);
  await writeAuditLog(actor, {
    action: "users.update",
    target: body.username,
    details: {
      role: doc.users[idx].role,
      active: doc.users[idx].active,
      passwordChanged: Boolean(body.password),
    },
  });
  return NextResponse.json({ success: true, users: publicUsers(doc) });
}
