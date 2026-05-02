import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { writeAuditLog } from "../../../lib/audit";
import {
  graphicsUploadDir,
  publicRelativeUrl,
  readGraphicsAssetsDoc,
  writeGraphicsAssetsDoc,
  type GraphicsAssetRecord,
} from "../../../lib/graphicsAssetsStore";
import { recordObservabilityEvent } from "../../../lib/observability";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

function canWriteAssets(user: ReturnType<typeof parseSessionToken>) {
  return hasPermission(user, "overlay.control") || hasPermission(user, "rack.configure");
}

export type GraphicsAssetDto = GraphicsAssetRecord & { url: string };

export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readGraphicsAssetsDoc();
  const assets: GraphicsAssetDto[] = doc.assets.map((a) => ({
    ...a,
    url: publicRelativeUrl(a.storedName),
  }));
  return NextResponse.json({
    updatedAt: doc.updatedAt,
    assets,
    canWrite: canWriteAssets(user),
  });
}

export async function DELETE(req: Request) {
  const user = sessionUser(req);
  if (!canWriteAssets(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query required" }, { status: 400 });
  }
  const doc = await readGraphicsAssetsDoc();
  const idx = doc.assets.findIndex((a) => a.id === id);
  if (idx < 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const removed = doc.assets[idx];
  const filePath = path.join(graphicsUploadDir(), removed.storedName);
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore missing file */
  }
  doc.assets.splice(idx, 1);
  doc.updatedAt = new Date().toISOString();
  await writeGraphicsAssetsDoc(doc);
  await writeAuditLog(user, {
    action: "graphics-assets.delete",
    target: removed.id,
    details: { storedName: removed.storedName },
  });
  await recordObservabilityEvent("graphics-assets.delete", { id });
  return NextResponse.json({ success: true, updatedAt: doc.updatedAt });
}
