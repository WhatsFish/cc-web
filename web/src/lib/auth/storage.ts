// Atomic JSON file helpers. All auth state files are small, single-writer,
// and rarely contested — a write-to-tmp + rename pattern is sufficient.

import fs from "node:fs/promises";
import path from "node:path";

export async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

export async function writeJSON(file: string, data: unknown, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode });
  await fs.rename(tmp, file);
}
