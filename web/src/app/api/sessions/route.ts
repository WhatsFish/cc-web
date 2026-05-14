import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { currentSession } from "@/lib/auth/require";
import { listSessions, createSession, isValidName, sessionExists } from "@/lib/tmux";

export const dynamic = "force-dynamic";

const ALLOWED_ROOT = "/home/liharr";

export async function GET(): Promise<NextResponse> {
  if (!(await currentSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ sessions: await listSessions() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await currentSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    cwd?: string;
    command?: string[];
  } | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { name, cwd, command } = body;
  if (!name || !isValidName(name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (await sessionExists(name)) {
    return NextResponse.json({ error: "name_taken" }, { status: 409 });
  }
  if (!cwd || typeof cwd !== "string") {
    return NextResponse.json({ error: "invalid_cwd" }, { status: 400 });
  }

  // Resolve symlinks etc. and confirm it's a directory inside ALLOWED_ROOT
  // so a bug in the web UI can't spawn tmux in /etc or wherever.
  let realCwd: string;
  try {
    realCwd = await fs.realpath(cwd);
  } catch {
    return NextResponse.json({ error: "cwd_not_found" }, { status: 400 });
  }
  if (realCwd !== ALLOWED_ROOT && !realCwd.startsWith(ALLOWED_ROOT + path.sep)) {
    return NextResponse.json({ error: "cwd_out_of_bounds" }, { status: 400 });
  }
  const stat = await fs.stat(realCwd);
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "cwd_not_dir" }, { status: 400 });
  }

  const cmd =
    Array.isArray(command) && command.length > 0 && command.every((s) => typeof s === "string")
      ? command
      : ["bash"];

  try {
    await createSession(name, realCwd, cmd);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "create_failed", detail: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, name });
}
