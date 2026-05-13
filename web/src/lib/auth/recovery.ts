import bcrypt from "bcryptjs";
import path from "node:path";
import { readJSON, writeJSON } from "./storage";
import { DATA_DIR } from "../config";

const RECOVERY = path.join(DATA_DIR, "recovery.json");

type RecoveryFile = { codes: { hash: string; usedAt: number | null }[] };

// Recovery codes are 12 chars of A-Z/2-9 (excluding ambiguous 0/O/1/I/L),
// presented to the user as XXXX-XXXX-XXXX. Accept input with or without
// dashes/whitespace, case-insensitive.
function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

export async function verifyAndConsumeRecovery(code: string): Promise<boolean> {
  const clean = normalize(code);
  if (!/^[A-Z0-9]{12}$/.test(clean)) return false;

  const data = await readJSON<RecoveryFile>(RECOVERY, { codes: [] });
  for (const entry of data.codes) {
    if (entry.usedAt !== null) continue;
    if (await bcrypt.compare(clean, entry.hash)) {
      entry.usedAt = Date.now();
      await writeJSON(RECOVERY, data);
      return true;
    }
  }
  return false;
}
