import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { recordObservabilityEvent } from "../../../lib/observability";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";
import {
  normalizeTallyControllersPut,
  readTallyControllersDoc,
  writeTallyControllersDoc,
  type TallyControllersDoc,
} from "../../../lib/tallyControllersStore";

function sessionUser(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return parseSessionToken(token);
}

export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readTallyControllersDoc();
  return NextResponse.json(doc);
}

export async function PUT(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<Pick<TallyControllersDoc, "controllers">>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.controllers)) {
    return NextResponse.json({ error: "controllers array required" }, { status: 400 });
  }
  const next = normalizeTallyControllersPut({ controllers: body.controllers });
  await writeTallyControllersDoc(next);
  await writeAuditLog(user, {
    action: "tally-controllers.update",
    target: "tally-controllers.json",
    details: { count: next.controllers.length },
  });
  await recordObservabilityEvent("tally-controllers.update", { user: user?.username });
  return NextResponse.json({ success: true, doc: next });
}
