import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

export type NdiRoutingPreset = {
  id: string;
  label: string;
  programId: string;
  previewId: string;
  tbar: number;
};

type PresetsDoc = { updatedAt: string; presets: NdiRoutingPreset[] };

const FALLBACK: PresetsDoc = {
  updatedAt: new Date().toISOString(),
  presets: [
    {
      id: "default-3cam",
      label: "3-Cam (PGM cam2)",
      programId: "cam2",
      previewId: "cam1",
      tbar: 0,
    },
    {
      id: "interview-cam1-pgm",
      label: "Interview — CAM1 program",
      programId: "cam1",
      previewId: "cam2",
      tbar: 0,
    },
    {
      id: "wide-pgm-cam3",
      label: "Wide — CAM3 program",
      programId: "cam3",
      previewId: "cam1",
      tbar: 0,
    },
  ],
};

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

  const filePath = path.join(process.cwd(), "data", "ndi-routing-presets.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const doc = JSON.parse(raw) as PresetsDoc;
    if (!Array.isArray(doc.presets)) {
      return NextResponse.json(FALLBACK);
    }
    return NextResponse.json(doc);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
