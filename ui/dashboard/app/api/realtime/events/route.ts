import { NextResponse } from "next/server";
import { readObservabilityEvents } from "../../../../lib/observability";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../../lib/security";

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

export async function GET(req: Request) {
  const user = sessionUser(req);
  if (!hasPermission(user, "rack.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode("event: hello\ndata: {\"ok\":true}\n\n"));
      let lastSig = "";
      const timer = setInterval(async () => {
        const events = await readObservabilityEvents(20);
        const sig = events.map((e) => `${e.at}:${e.type}`).join("|");
        if (sig !== lastSig) {
          lastSig = sig;
          controller.enqueue(enc.encode(`event: sync\ndata: ${JSON.stringify({ at: new Date().toISOString(), events })}\n\n`));
        } else {
          controller.enqueue(enc.encode(`event: ping\ndata: {"at":"${new Date().toISOString()}"}\n\n`));
        }
      }, 2000);
      setTimeout(() => {
        clearInterval(timer);
        controller.close();
      }, 55_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
