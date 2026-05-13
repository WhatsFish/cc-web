// Signed session cookies + server-side session records (revocable).
//
// Cookie format: `<sessionId>.<hmacSig>`
//   - sessionId: 32 random bytes, base64url
//   - hmacSig:   HMAC-SHA256(sessionId, CC_WEB_COOKIE_KEY), base64url
//
// Sessions are also recorded in data/sessions.json so they can be revoked
// (logout, or future "sign out other sessions" UI). HMAC verification at
// request time keeps the deep filesystem check off the hot path; lookup
// happens only for routes that need to track sliding TTL.

import crypto from "node:crypto";
import path from "node:path";
import { readJSON, writeJSON } from "./storage";
import { DATA_DIR, SESSION_TTL_MS } from "../config";

const SESSIONS = path.join(DATA_DIR, "sessions.json");

export type Session = {
  id: string;
  ip: string;
  ua: string;
  createdAt: number;
  lastSeenAt: number;
};
type SessionFile = { sessions: Session[] };

function getKey(): Buffer {
  const hex = process.env.CC_WEB_COOKIE_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("CC_WEB_COOKIE_KEY missing or wrong format (need 64 hex chars). Run `npm run setup`.");
  }
  return Buffer.from(hex, "hex");
}

export function signCookie(sessionId: string): string {
  const sig = crypto.createHmac("sha256", getKey()).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

export function verifyCookieSignature(value: string): string | null {
  const idx = value.indexOf(".");
  if (idx === -1) return null;
  const sessionId = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getKey()).update(sessionId).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return sessionId;
}

export async function createSession(ip: string, ua: string): Promise<string> {
  const id = crypto.randomBytes(32).toString("base64url");
  const data = await readJSON<SessionFile>(SESSIONS, { sessions: [] });
  const now = Date.now();
  data.sessions.push({ id, ip, ua, createdAt: now, lastSeenAt: now });
  // Opportunistic pruning: drop expired sessions while we're writing.
  data.sessions = data.sessions.filter((s) => now - s.lastSeenAt <= SESSION_TTL_MS);
  await writeJSON(SESSIONS, data);
  return id;
}

// Look up a session by id, drop it if expired, otherwise refresh lastSeenAt
// and persist (sliding TTL).
export async function touchSession(id: string): Promise<Session | null> {
  const data = await readJSON<SessionFile>(SESSIONS, { sessions: [] });
  const idx = data.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const s = data.sessions[idx];
  if (Date.now() - s.lastSeenAt > SESSION_TTL_MS) {
    data.sessions.splice(idx, 1);
    await writeJSON(SESSIONS, data);
    return null;
  }
  s.lastSeenAt = Date.now();
  await writeJSON(SESSIONS, data);
  return s;
}

export async function revokeSession(id: string): Promise<void> {
  const data = await readJSON<SessionFile>(SESSIONS, { sessions: [] });
  const next = data.sessions.filter((s) => s.id !== id);
  if (next.length === data.sessions.length) return;
  await writeJSON(SESSIONS, { sessions: next });
}
