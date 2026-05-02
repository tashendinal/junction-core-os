import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { writeAuditLog } from "../../../../lib/audit";
import {
  graphicsUploadDir,
  readGraphicsAssetsDoc,
  writeGraphicsAssetsDoc,
  type GraphicsAssetKind,
  type GraphicsAssetRecord,
} from "../../../../lib/graphicsAssetsStore";
import { recordObservabilityEvent } from "../../../../lib/observability";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

export const runtime = "nodejs";
export const maxDuration = 120;

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_VIDEO = 120 * 1024 * 1024;

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

function canWrite(user: ReturnType<typeof parseSessionToken>) {
  return hasPermission(user, "overlay.control") || hasPermission(user, "rack.configure");
}

function kindFromMime(mime: string): GraphicsAssetKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export async function POST(req: Request) {
  const user = sessionUser(req);
  if (!canWrite(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!MIME_EXT[mimeType]) {
    return NextResponse.json(
      { error: `Unsupported type ${mimeType}. Use PNG/JPEG/WebP/GIF or MP4/WebM/MOV.` },
      { status: 400 }
    );
  }

  const kind = kindFromMime(mimeType);
  if (!kind) {
    return NextResponse.json({ error: "Not an image or video" }, { status: 400 });
  }

  const maxBytes = kind === "image" ? MAX_IMAGE : MAX_VIDEO;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large (max ${kind === "image" ? "25MB" : "120MB"})` },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const ext = MIME_EXT[mimeType];
  const storedName = `${id}${ext}`;
  const dir = graphicsUploadDir();
  await fs.mkdir(dir, { recursive: true });
  const diskPath = path.join(dir, storedName);
  await fs.writeFile(diskPath, buf);

  const originalName =
    typeof (file as { name?: string }).name === "string" ? (file as { name: string }).name : storedName;

  const record: GraphicsAssetRecord = {
    id,
    storedName,
    originalName: originalName.slice(0, 240),
    mimeType,
    kind,
    bytes: buf.length,
    createdAt: new Date().toISOString(),
  };

  const doc = await readGraphicsAssetsDoc();
  doc.assets = [record, ...doc.assets];
  doc.updatedAt = record.createdAt;
  await writeGraphicsAssetsDoc(doc);

  await writeAuditLog(user, {
    action: "graphics-assets.upload",
    target: id,
    details: { kind, bytes: buf.length },
  });
  await recordObservabilityEvent("graphics-assets.upload", { id, kind });

  return NextResponse.json({
    success: true,
    asset: record,
    url: `/junction-graphics/${encodeURIComponent(storedName)}`,
  });
}
