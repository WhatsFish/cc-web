import { authenticator } from "otplib";
import path from "node:path";
import { readJSON, writeJSON } from "./storage";
import { DATA_DIR } from "../config";

const AUTH_STATE = path.join(DATA_DIR, "auth-state.json");

type AuthState = { lastUsedCounter: number };

// ±1 window for clock drift (30s either side).
authenticator.options = { window: 1 };

// Verify a 6-digit code against the secret AND advance the replay-guard
// counter so the same code can't be re-presented within its validity window.
export async function verifyTotp(code: string, secret: string): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const delta = authenticator.checkDelta(clean, secret);
  if (delta === null) return false;

  const usedCounter = Math.floor(Date.now() / 30000) + delta;
  const state = await readJSON<AuthState>(AUTH_STATE, { lastUsedCounter: 0 });
  if (usedCounter <= state.lastUsedCounter) return false;

  await writeJSON(AUTH_STATE, { lastUsedCounter: usedCounter });
  return true;
}
