import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCookieSignature, revokeSession } from "@/lib/auth/session";
import { COOKIE_NAME, COOKIE_PATH } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const value = cookies().get(COOKIE_NAME)?.value;
  if (value) {
    const id = verifyCookieSignature(value);
    if (id) await revokeSession(id);
  }
  // 303 turns the POST into a GET on /login so the browser doesn't
  // re-submit if the user hits back.
  const loginUrl = new URL("/cc-web/login", req.url);
  const res = NextResponse.redirect(loginUrl, 303);
  res.cookies.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
  return res;
}
