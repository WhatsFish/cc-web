// Custom Node server that wraps Next.js and intercepts WebSocket upgrades
// at /cc-web/ws/term/<name>, auth-gates them via the signed session cookie,
// and bridges them to a `tmux attach` PTY via node-pty.
//
// Why a custom server: Next.js App Router has no first-class WebSocket
// routes. The standard pattern is to keep Next on a node http.Server and
// handle `upgrade` ourselves. Everything non-WS still goes to Next.
//
// systemd ExecStart runs `npm start` → `tsx server.ts`, so source-level
// TS imports work without a separate build step for this file.

import { createServer, IncomingMessage } from "node:http";
import { parse } from "node:url";
import type { Socket } from "node:net";

import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { spawn as spawnPty, type IPty } from "node-pty";

import { parseCookieHeader } from "./src/lib/auth/cookie";
import { verifyCookieSignature, touchSession } from "./src/lib/auth/session";
import { COOKIE_NAME } from "./src/lib/config";
import { isValidName, sessionExists } from "./src/lib/tmux";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3010);
const hostname = "127.0.0.1";

const WS_PREFIX = "/cc-web/ws/term/";

async function main(): Promise<void> {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true));
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    handleUpgrade(req, socket as Socket, head, wss).catch((e) => {
      console.error("upgrade error:", e);
      try { (socket as Socket).destroy(); } catch {}
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`cc-web ready on http://${hostname}:${port}  (dev=${dev})`);
  });
}

async function handleUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  wss: WebSocketServer,
): Promise<void> {
  const url = req.url ?? "";
  if (!url.startsWith(WS_PREFIX)) {
    socket.destroy();
    return;
  }
  const tmuxName = decodeURIComponent(url.slice(WS_PREFIX.length).split("?")[0]);
  if (!isValidName(tmuxName)) return reject(socket, 400, "bad name");

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieVal = cookies[COOKIE_NAME];
  if (!cookieVal) return reject(socket, 401, "no cookie");
  const sid = verifyCookieSignature(cookieVal);
  if (!sid) return reject(socket, 401, "bad cookie");
  const session = await touchSession(sid);
  if (!session) return reject(socket, 401, "expired");

  if (!(await sessionExists(tmuxName))) return reject(socket, 404, "no session");

  wss.handleUpgrade(req, socket, head, (ws) => {
    handleTermConnection(ws, tmuxName);
  });
}

function reject(socket: Socket, code: number, reason: string): void {
  socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

// Wire protocol (text frames in both directions):
//   client → server: JSON {type:"in", data:string} | {type:"resize", cols, rows}
//   server → client: raw PTY bytes (binary frames; xterm.write handles both)
function handleTermConnection(ws: WebSocket, tmuxName: string): void {
  let pty: IPty | null = null;
  try {
    pty = spawnPty("tmux", ["attach-session", "-t", `=${tmuxName}`], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env as Record<string, string>,
    });
  } catch (e) {
    console.error(`tmux attach failed for ${tmuxName}:`, e);
    try { ws.close(1011, "tmux-attach-failed"); } catch {}
    return;
  }

  const p = pty;
  p.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  p.onExit(({ exitCode }) => {
    try { ws.close(1000, `pty-exit-${exitCode}`); } catch {}
  });

  ws.on("message", (raw) => {
    let msg: { type?: string; data?: string; cols?: number; rows?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "in" && typeof msg.data === "string") {
      p.write(msg.data);
    } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
      try { p.resize(Math.max(1, msg.cols | 0), Math.max(1, msg.rows | 0)); } catch {}
    }
  });

  const cleanup = () => { try { p.kill(); } catch {} };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

main().catch((e) => {
  console.error("server boot failed:", e);
  process.exit(1);
});
