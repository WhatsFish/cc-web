"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// Sticky bar above the on-screen keyboard on phones. The terminal alone
// is unusable on touch — these are the keys you actually need to get out
// of trouble in Claude Code (Esc, Ctrl-C) or to navigate (Tab, arrows).
const KEY_BAR: { label: string; send: string }[] = [
  { label: "Esc", send: "\x1b" },
  { label: "Tab", send: "\t" },
  { label: "Ctrl-C", send: "\x03" },
  { label: "Ctrl-D", send: "\x04" },
  { label: "↑", send: "\x1b[A" },
  { label: "↓", send: "\x1b[B" },
  { label: "↵", send: "\r" },
];

type Status = "connecting" | "open" | "closed";

export default function Terminal({ name }: { name: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [closeReason, setCloseReason] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 14,
      cursorBlink: true,
      scrollback: 10000,
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        cursor: "#22c55e",
        selectionBackground: "#404040",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    // First fit must happen after layout — defer one tick.
    requestAnimationFrame(() => fit.fit());
    termRef.current = term;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/cc-web/ws/term/${encodeURIComponent(name)}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      term.focus();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        term.write(ev.data);
      } else {
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      }
    };
    ws.onclose = (ev) => {
      setStatus("closed");
      setCloseReason(ev.reason || `code ${ev.code}`);
    };
    ws.onerror = () => {
      setStatus((prev) => (prev === "open" ? "closed" : prev));
      setCloseReason((prev) => prev ?? "error");
    };

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "in", data }));
      }
    });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onWindowResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fit.fit();
        } catch {
          // Container might not be visible yet
        }
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      }, 100);
    };
    window.addEventListener("resize", onWindowResize);
    // iOS Safari viewport resize when the on-screen keyboard appears.
    window.visualViewport?.addEventListener("resize", onWindowResize);

    return () => {
      dataDisposable.dispose();
      window.removeEventListener("resize", onWindowResize);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
      if (resizeTimer) clearTimeout(resizeTimer);
      try { ws.close(); } catch {}
      try { term.dispose(); } catch {}
    };
  }, [name]);

  function sendKey(s: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "in", data: s }));
    }
    termRef.current?.focus();
  }

  const statusColor =
    status === "open" ? "text-emerald-400" :
    status === "connecting" ? "text-amber-400" :
    "text-red-400";
  const statusLabel =
    status === "open" ? "● connected" :
    status === "connecting" ? "● connecting" :
    `● disconnected${closeReason ? ` — ${closeReason}` : ""}`;

  return (
    <div className="flex h-[100dvh] flex-col bg-neutral-950">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
        <Link href="/sessions" className="shrink-0 hover:underline">
          ← sessions
        </Link>
        <span className="truncate font-mono">{name}</span>
        <span className={`shrink-0 ${statusColor}`}>{statusLabel}</span>
      </header>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" />
      <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs">
        {KEY_BAR.map((k) => (
          <button
            key={k.label}
            onClick={() => sendKey(k.send)}
            type="button"
            className="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 font-mono text-neutral-200 active:bg-neutral-700"
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
