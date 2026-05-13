import { NextRequest, NextResponse } from "next/server";
import { verifyTotp } from "@/lib/auth/totp";
import { verifyAndConsumeRecovery } from "@/lib/auth/recovery";
import { consumeRate, recordFailure, recordSuccess } from "@/lib/auth/ratelimit";
import { createSession, signCookie } from "@/lib/auth/session";
import { COOKIE_NAME, COOKIE_PATH, SESSION_TTL_MS } from "@/lib/config";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  // No XFF means the request reached us without going through nginx — only
  // possible if someone hit 127.0.0.1:3010 directly. Group those under one
  // bucket so a misconfigured proxy can't be used to evade the rate limit.
  return "no-xff";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  const rate = await consumeRate(ip);
  if (!rate.ok) {
    return NextResponse.json(
      { error: rate.banned ? "banned" : "rate_limited", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => null)) as { code?: string; recoveryCode?: string } | null;
  if (!body || (!body.code && !body.recoveryCode)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let ok = false;
  if (body.code) {
    const secret = process.env.CC_WEB_TOTP_SECRET;
    if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 });
    ok = await verifyTotp(body.code, secret);
  } else if (body.recoveryCode) {
    ok = await verifyAndConsumeRecovery(body.recoveryCode);
  }

  if (!ok) {
    await recordFailure(ip);
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  recordSuccess(ip);
  const sessionId = await createSession(ip, ua);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, signCookie(sessionId), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
