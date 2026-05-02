import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

type BackupBundle = { createdAt: string; files: Record<string, unknown> };

function backupPath(name: string) {
  return path.join(process.cwd(), "backups", name);
}
function dataPath(name: string) {
  return path.join(process.cwd(), "data", name);
}

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, "server.network_storage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { backupName?: string };
  try {
    body = (await req.json()) as { backupName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.backupName) {
    return NextResponse.json({ error: "backupName is required" }, { status: 400 });
  }

  const raw = await fs.readFile(backupPath(body.backupName), "utf8");
  const bundle = JSON.parse(raw) as BackupBundle;
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  for (const [name, content] of Object.entries(bundle.files || {})) {
    if (!name.endsWith(".json")) continue;
    await fs.writeFile(dataPath(name), `${JSON.stringify(content, null, 2)}\n`, "utf8");
  }
  await writeAuditLog(user, {
    action: "backup.restore",
    target: body.backupName,
    details: { restoredAt: new Date().toISOString() },
  });
  return NextResponse.json({ success: true });
}
