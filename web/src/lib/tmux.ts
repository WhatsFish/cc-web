// Thin wrapper over the `tmux` CLI. Every CLI session in cc-web lives in
// a tmux session: this gives us free persistence, free detach/reattach,
// and means a session started from the web is also visible/attachable
// from a plain ssh terminal (and vice versa).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type TmuxSession = {
  name: string;
  createdAt: number; // unix seconds
  attached: boolean;
  windows: number;
};

// tmux session names: allow A-Z, a-z, 0-9, dash, underscore. Names with ":"
// or "." would confuse target-spec parsing; rejecting up front is simpler
// than escaping correctly.
const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidName(name: string): boolean {
  return NAME_RE.test(name);
}

// Parse `tmux ls -F` output. tmux exits 1 (with "no server running" or
// "no sessions") when nothing exists — we treat that as an empty list.
export async function listSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execFileP(
      "tmux",
      ["ls", "-F", "#{session_name}\t#{session_created}\t#{session_attached}\t#{session_windows}"],
      { encoding: "utf8" },
    );
    return stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        const [name, createdAt, attached, windows] = line.split("\t");
        return {
          name,
          createdAt: Number(createdAt),
          attached: attached !== "0",
          windows: Number(windows),
        };
      });
  } catch (e: unknown) {
    const err = e as { stderr?: string; code?: number };
    const stderr = err.stderr ?? "";
    // tmux exits 1 on cold server (socket doesn't exist), no sessions, or
    // server-not-running — all of these mean "empty list" for our purposes.
    if (
      stderr.includes("no server running") ||
      stderr.includes("no sessions") ||
      stderr.includes("error connecting")
    ) {
      return [];
    }
    throw e;
  }
}

export async function sessionExists(name: string): Promise<boolean> {
  if (!isValidName(name)) return false;
  try {
    await execFileP("tmux", ["has-session", "-t", `=${name}`]);
    return true;
  } catch {
    return false;
  }
}

// Create a detached tmux session. Caller is responsible for picking a
// non-colliding name and a sane cwd / command.
export async function createSession(
  name: string,
  cwd: string,
  command: string[],
): Promise<void> {
  if (!isValidName(name)) throw new Error(`invalid session name: ${name}`);
  if (await sessionExists(name)) throw new Error(`session exists: ${name}`);
  // Spawn an interactive shell that then exec's the command, so when the
  // command exits the shell stays alive (user can inspect, then exit).
  // For `bash` preset we just want a bare shell, so command may be empty.
  const args = ["new-session", "-d", "-s", name, "-c", cwd];
  if (command.length > 0) {
    // `bash -c` (NOT `bash -lc`): non-interactive login shells skip
    // ~/.bashrc, which is where nvm's PATH addition lives — so `bash -lc
    // 'claude'` would fail with "command not found". Plain `bash -c` just
    // inherits PATH from tmux (which inherits from our systemd unit).
    // After the command exits, drop to interactive bash; `exec bash` IS
    // interactive (stdin is a TTY), so .bashrc loads correctly there.
    const inner = command.map(quoteShell).join(" ");
    args.push("bash", "-c", `${inner}; echo; echo '[session exited; exec bash to reopen]'; exec bash`);
  } else {
    args.push("bash");
  }
  await execFileP("tmux", args);
}

export async function killSession(name: string): Promise<void> {
  if (!isValidName(name)) throw new Error(`invalid session name: ${name}`);
  await execFileP("tmux", ["kill-session", "-t", `=${name}`]);
}

// Minimal POSIX shell single-quoting: wrap in '...' and escape any '.
function quoteShell(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
