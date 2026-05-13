// requireAuth() — call from a server component or route handler to gate
// access. Resolves the current session, refreshing its TTL, or redirects
// to /login if absent/invalid/expired/revoked.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "../config";
import { verifyCookieSignature, touchSession, Session } from "./session";

export async function requireAuth(): Promise<Session> {
  const value = cookies().get(COOKIE_NAME)?.value;
  if (!value) redirect("/login");
  const sessionId = verifyCookieSignature(value);
  if (!sessionId) redirect("/login");
  const session = await touchSession(sessionId);
  if (!session) redirect("/login");
  return session;
}

// Same check, but doesn't redirect — returns null on miss. Useful for
// /login itself which should bounce already-authed users to /.
export async function currentSession(): Promise<Session | null> {
  const value = cookies().get(COOKIE_NAME)?.value;
  if (!value) return null;
  const sessionId = verifyCookieSignature(value);
  if (!sessionId) return null;
  return touchSession(sessionId);
}
