import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { SESSION_COOKIE, hasPermission, parseSessionToken } from "../../../lib/security";

type Body = {
  title?: string;
  message?: string;
  severity?: "info" | "warning" | "critical";
};

async function sendSlack(text: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return { ok: false, message: "SLACK_WEBHOOK_URL not configured" };
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return { ok: res.ok, message: res.ok ? "Slack sent" : `Slack failed (${res.status})` };
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, message: "Telegram env not configured" };
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return { ok: res.ok, message: res.ok ? "Telegram sent" : `Telegram failed (${res.status})` };
}

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  const user = parseSessionToken(token);
  if (!hasPermission(user, "server.health")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = body.title || "Junction Core Alert";
  const severity = body.severity || "warning";
  const message = body.message || "Broadcast system event";
  const text = `[${severity.toUpperCase()}] ${title}\n${message}`;

  const [slack, telegram] = await Promise.all([sendSlack(text), sendTelegram(text)]);
  await writeAuditLog(user, {
    action: "notifications.dispatch",
    target: "external-channels",
    details: { severity, title, slack: slack.message, telegram: telegram.message },
  });
  return NextResponse.json({ success: true, slack, telegram });
}
