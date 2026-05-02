import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type FiberConfig = {
  provider: string;
  pathLabel: string;
  remoteSite: string;
  localSite: string;
  primaryIp: string;
  backupIp: string;
  vlanId: number;
  mtu: number;
  encryption: boolean;
};

const DEFAULT_CONFIG: FiberConfig = {
  provider: "SLT Fiber",
  pathLabel: "Kandy OB Bus -> Colombo Control",
  remoteSite: "Kandy",
  localSite: "Colombo",
  primaryIp: "10.20.0.1",
  backupIp: "10.20.0.2",
  vlanId: 200,
  mtu: 1500,
  encryption: true,
};

function configPath() {
  return path.join(process.cwd(), "data", "fiber-link.json");
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

  const filePath = configPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const config = JSON.parse(raw) as FiberConfig;
    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ config: DEFAULT_CONFIG });
  }
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

  let body: FiberConfig;
  try {
    body = (await req.json()) as FiberConfig;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filePath = configPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  await writeAuditLog(user, {
    action: "fiber.config.update",
    target: "fiber-link",
    details: body,
  });
  return NextResponse.json({ success: true, config: body });
}
