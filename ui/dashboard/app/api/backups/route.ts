import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type BackupBundle = {
  createdAt: string;
  files: Record<string, unknown>;
};

const DATA_FILES = [
  "node-metrics.json",
  "node-commands.json",
  "link-balancer.json",
  "fiber-link.json",
  "broadcast-profiles.json",
  "server-config.json",
  "server-services.json",
  "observability-events.json",
  "on-air-checklist.json",
  "on-air-session.json",
  "recording-rack.json",
  "recording-sessions.json",
  "gpu-modules.json",
  "overlay-modules.json",
  "graphics-show.json",
  "graphics-assets.json",
];

function dataPath(name: string) {
  return path.join(process.cwd(), "data", name);
}
function backupDir() {
  return path.join(process.cwd(), "backups");
}

async function auth(req: Request, permission: "rack.view" | "server.network_storage") {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, permission)) return { user: null };
  return { user };
}

export async function GET(req: Request) {
  const { user } = await auth(req, "rack.view");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await fs.mkdir(backupDir(), { recursive: true });
  const list = await fs.readdir(backupDir());
  const backups = list.filter((f) => f.endsWith(".json")).sort().reverse();
  return NextResponse.json({ backups });
}

export async function POST(req: Request) {
  const { user } = await auth(req, "server.network_storage");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bundle: BackupBundle = { createdAt: new Date().toISOString(), files: {} };
  for (const file of DATA_FILES) {
    try {
      const raw = await fs.readFile(dataPath(file), "utf8");
      bundle.files[file] = JSON.parse(raw);
    } catch {
      bundle.files[file] = null;
    }
  }

  await fs.mkdir(backupDir(), { recursive: true });
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const outPath = path.join(backupDir(), name);
  await fs.writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await writeAuditLog(user, {
    action: "backup.create",
    target: name,
    details: { fileCount: Object.keys(bundle.files).length },
  });
  return NextResponse.json({ success: true, backup: name });
}
