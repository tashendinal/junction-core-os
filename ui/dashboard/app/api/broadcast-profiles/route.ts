import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type BroadcastProtocol = "rtmp" | "srt" | "rist";

type BroadcastProfile = {
  id: string;
  name: string;
  protocol: BroadcastProtocol;
  primaryUrl: string;
  backupUrl: string;
  bitrateKbps: number;
  latencyMs: number;
  enabled: boolean;
};

type ProfileDoc = {
  updatedAt: string;
  profiles: BroadcastProfile[];
};

const DEFAULT_DOC: ProfileDoc = {
  updatedAt: new Date().toISOString(),
  profiles: [
    {
      id: "live-rtmp-main",
      name: "Live RTMP Main",
      protocol: "rtmp",
      primaryUrl: "rtmp://uplink-primary/live/main",
      backupUrl: "rtmp://uplink-backup/live/main",
      bitrateKbps: 8000,
      latencyMs: 2500,
      enabled: true,
    },
    {
      id: "remote-srt-lowlatency",
      name: "Remote SRT Low Latency",
      protocol: "srt",
      primaryUrl: "srt://uplink-primary:9000?mode=caller",
      backupUrl: "srt://uplink-backup:9000?mode=caller",
      bitrateKbps: 6000,
      latencyMs: 180,
      enabled: true,
    },
    {
      id: "disaster-rist",
      name: "Disaster Recovery RIST",
      protocol: "rist",
      primaryUrl: "rist://uplink-primary:8193",
      backupUrl: "rist://uplink-backup:8193",
      bitrateKbps: 4500,
      latencyMs: 300,
      enabled: false,
    },
  ],
};

function profilePath() {
  return path.join(process.cwd(), "data", "broadcast-profiles.json");
}

async function readProfiles(): Promise<ProfileDoc> {
  try {
    const raw = await fs.readFile(profilePath(), "utf8");
    return JSON.parse(raw) as ProfileDoc;
  } catch {
    return DEFAULT_DOC;
  }
}

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await readProfiles());
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

  let body: { profiles?: BroadcastProfile[] };
  try {
    body = (await req.json()) as { profiles?: BroadcastProfile[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.profiles)) {
    return NextResponse.json({ error: "profiles is required" }, { status: 400 });
  }

  const next: ProfileDoc = {
    updatedAt: new Date().toISOString(),
    profiles: body.profiles,
  };
  await fs.mkdir(path.dirname(profilePath()), { recursive: true });
  await fs.writeFile(profilePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await writeAuditLog(user, {
    action: "broadcast.profiles.update",
    target: "broadcast-profiles",
    details: { count: next.profiles.length },
  });
  return NextResponse.json({ success: true, ...next });
}
