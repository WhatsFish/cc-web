// Per-IP rate limit + persistent ban list for /api/login.
//
// Rate counter is in-memory (a restart resets it), but the ban list is
// persisted so that a sustained brute-force can't be reset by killing the
// service.

import path from "node:path";
import { readJSON, writeJSON } from "./storage";
import {
  DATA_DIR,
  RATE_WINDOW_MS,
  RATE_MAX_PER_WINDOW,
  BAN_AFTER_CONSECUTIVE_FAILURES,
  BAN_DURATION_MS,
} from "../config";

const BANNED = path.join(DATA_DIR, "banned.json");

type Attempt = { failures: number; consecutiveFailures: number; windowStart: number };
const attempts = new Map<string, Attempt>();

type BannedFile = Record<string, number>; // ip → expiresAtMs

async function readBanned(): Promise<BannedFile> {
  return readJSON<BannedFile>(BANNED, {});
}

async function isBanned(ip: string): Promise<number | null> {
  const banned = await readBanned();
  const expires = banned[ip];
  if (!expires) return null;
  if (Date.now() >= expires) {
    delete banned[ip];
    await writeJSON(BANNED, banned);
    return null;
  }
  return expires;
}

// Call before processing a login attempt. Returns whether the request may
// proceed. If false, caller should respond 429 with retryAfterSec.
export async function consumeRate(ip: string): Promise<
  { ok: true } | { ok: false; banned: boolean; retryAfterSec: number }
> {
  const banUntil = await isBanned(ip);
  if (banUntil !== null) {
    return { ok: false, banned: true, retryAfterSec: Math.max(1, Math.ceil((banUntil - Date.now()) / 1000)) };
  }

  const now = Date.now();
  const a = attempts.get(ip) ?? { failures: 0, consecutiveFailures: 0, windowStart: now };
  if (now - a.windowStart > RATE_WINDOW_MS) {
    a.failures = 0;
    a.windowStart = now;
  }
  if (a.failures >= RATE_MAX_PER_WINDOW) {
    return { ok: false, banned: false, retryAfterSec: Math.max(1, Math.ceil((a.windowStart + RATE_WINDOW_MS - now) / 1000)) };
  }
  attempts.set(ip, a);
  return { ok: true };
}

export async function recordFailure(ip: string): Promise<void> {
  const now = Date.now();
  const a = attempts.get(ip) ?? { failures: 0, consecutiveFailures: 0, windowStart: now };
  a.failures += 1;
  a.consecutiveFailures += 1;
  attempts.set(ip, a);

  if (a.consecutiveFailures >= BAN_AFTER_CONSECUTIVE_FAILURES) {
    const banned = await readBanned();
    banned[ip] = Date.now() + BAN_DURATION_MS;
    await writeJSON(BANNED, banned);
    attempts.delete(ip);
  }
}

export function recordSuccess(ip: string): void {
  attempts.delete(ip);
}
