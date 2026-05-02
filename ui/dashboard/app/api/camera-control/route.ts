import dgram from "node:dgram";
import { NextResponse } from "next/server";
import type { CameraControlRequest } from "../../../lib/cameraControlTypes";
import { DEFAULT_VISCA_PORT } from "../../../lib/cameraControlTypes";
import { getCameraModelById } from "../../../lib/cameraModelsCatalog";
import { viscaPacketForCommand } from "../../../lib/viscaIp";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

function isSafeHost(host: string): boolean {
  if (process.env.JUNCTION_CAMERA_RELAX_HOST_CHECK === "1") {
    return true;
  }
  const h = host.trim().toLowerCase();
  if (!h || h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".local") || h.endsWith(".lan")) return true;
  // Basic private / link-local ranges for OB LAN (not a full SSRF guard)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

async function sendUdp(host: string, port: number, payload: Buffer): Promise<void> {
  const socket = dgram.createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.send(payload, port, host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } finally {
    socket.close();
  }
}

export async function POST(req: Request) {
  const user = sessionUser(req);
  if (!(hasPermission(user, "camera.control") || hasPermission(user, "server.health"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CameraControlRequest;
  try {
    body = (await req.json()) as CameraControlRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const host = typeof body.host === "string" ? body.host.trim() : "";
  if (!host) {
    return NextResponse.json({ error: "host is required" }, { status: 400 });
  }
  if (process.env.NODE_ENV === "production" && !isSafeHost(host)) {
    return NextResponse.json(
      { error: "Host must be localhost or a private/LINK-LOCAL address in production" },
      { status: 400 }
    );
  }

  const vendor = body.vendor;
  const command = body.command;
  if (!vendor || !command) {
    return NextResponse.json({ error: "vendor and command are required" }, { status: 400 });
  }

  const modelMeta = getCameraModelById(typeof body.modelId === "string" ? body.modelId : undefined);
  const modelLabel = modelMeta?.label ?? (typeof body.modelId === "string" ? body.modelId : null);

  if (vendor === "sony") {
    const port = typeof body.port === "number" && body.port > 0 ? body.port : DEFAULT_VISCA_PORT;
    const packet = viscaPacketForCommand(command, body.presetIndex);
    if (!packet) {
      return NextResponse.json(
        {
          ok: false,
          vendor: "sony",
          message:
            command === "preset_recall" || command === "preset_store"
              ? "presetIndex 0–15 required"
              : "Unknown command for VISCA",
        },
        { status: 400 }
      );
    }
    try {
      await sendUdp(host, port, packet);
      return NextResponse.json({
        ok: true,
        vendor: "sony",
        protocol: "visca-ip",
        port,
        bytesSent: packet.length,
        hex: packet.toString("hex"),
        modelId: body.modelId ?? null,
        modelLabel,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "UDP send failed";
      return NextResponse.json(
        { ok: false, vendor: "sony", protocol: "visca-ip", message },
        { status: 502 }
      );
    }
  }

  if (vendor === "canon") {
    const name = modelLabel || "this Canon body";
    return NextResponse.json({
      ok: false,
      vendor: "canon",
      protocol: "ccapi_http",
      modelId: body.modelId ?? null,
      modelLabel,
      message: `${name}: enable CCAPI on the camera, then a future Junction adapter will call http://<camera>:8080/ccapi/… (port may vary). NDI carries video only.`,
    });
  }
  if (vendor === "nikon") {
    const name = modelLabel || "this Nikon body";
    return NextResponse.json({
      ok: false,
      vendor: "nikon",
      protocol: "nikon_network",
      modelId: body.modelId ?? null,
      modelLabel,
      message: `${name}: no VISCA/IP path on Z bodies in this build. Next step is a Nikon HTTP/SDK adapter; NDI remains picture/sound only.`,
    });
  }
  if (vendor === "red") {
    const name = modelLabel || "RED system";
    return NextResponse.json({
      ok: false,
      vendor: "red",
      protocol: "red_rcp",
      modelId: body.modelId ?? null,
      modelLabel,
      message: `${name}: RCP / camera services are separate from NDI video; Junction RED adapter not wired in this build.`,
    });
  }

  return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
}
