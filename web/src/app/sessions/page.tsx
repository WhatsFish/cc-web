import fs from "node:fs/promises";
import { requireAuth } from "@/lib/auth/require";
import { listSessions } from "@/lib/tmux";
import SessionsView from "./SessionsView";

export const dynamic = "force-dynamic";

async function listCwds(): Promise<string[]> {
  // Plausible starting directories. Home plus each ~/src/<project>.
  const out: string[] = ["/home/liharr"];
  try {
    const entries = await fs.readdir("/home/liharr/src", { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".")) {
        out.push(`/home/liharr/src/${e.name}`);
      }
    }
  } catch {}
  return out;
}

export default async function SessionsPage() {
  await requireAuth();
  const [sessions, cwds] = await Promise.all([listSessions(), listCwds()]);
  return <SessionsView sessions={sessions} cwds={cwds} />;
}
