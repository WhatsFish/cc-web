"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TmuxSession } from "@/lib/tmux";

type Preset = { id: string; label: string; command: string[] };

const PRESETS: Preset[] = [
  { id: "claude", label: "Claude Code", command: ["claude"] },
  { id: "bash", label: "Bash", command: ["bash"] },
];

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? "home";
}

function formatAge(unixSec: number): string {
  const ms = Date.now() - unixSec * 1000;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SessionsView({
  sessions,
  cwds,
}: {
  sessions: TmuxSession[];
  cwds: string[];
}) {
  const router = useRouter();
  const [presetId, setPresetId] = useState<string>(PRESETS[0].id);
  const [cwd, setCwd] = useState<string>(cwds[0] ?? "/home/liharr");
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const placeholderName = `${presetId}-${basename(cwd)}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const finalName = name.trim() || placeholderName;
    const command = PRESETS.find((p) => p.id === presetId)!.command;

    const r = await fetch("/cc-web/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: finalName, cwd, command }),
    });
    if (r.ok) {
      router.push(`/term/${encodeURIComponent(finalName)}`);
      return;
    }
    setBusy(false);
    const data = (await r.json().catch(() => ({}))) as { error?: string; detail?: string };
    setError(data.error ? (data.detail ? `${data.error}: ${data.detail}` : data.error) : "create failed");
  }

  async function onKill(targetName: string) {
    if (!confirm(`Kill tmux session "${targetName}"?`)) return;
    const r = await fetch(`/cc-web/api/sessions/${encodeURIComponent(targetName)}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else alert("kill failed");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">cc-web</h1>
        <form action="/cc-web/api/logout" method="POST">
          <button type="submit" className="text-xs text-neutral-500 hover:underline">
            sign out
          </button>
        </form>
      </header>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500">New session</h2>
        <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Preset</span>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Working directory</span>
            <select
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-900"
            >
              {cwds.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-neutral-500">Session name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholderName}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="self-end rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Creating…" : "Create + open"}
          </button>
          {error && (
            <p className="col-span-full text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>

      <section className="mt-12">
        <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Sessions ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            No tmux sessions running. Create one above, or start one from an ssh terminal — it&apos;ll appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {sessions.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-4 py-3">
                <Link
                  href={`/term/${encodeURIComponent(s.name)}`}
                  className="flex-1 truncate font-mono text-sm hover:underline"
                >
                  {s.name}
                </Link>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <span title={new Date(s.createdAt * 1000).toISOString()}>{formatAge(s.createdAt)}</span>
                  <span>
                    {s.windows} {s.windows === 1 ? "window" : "windows"}
                  </span>
                  {s.attached && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100">
                      attached
                    </span>
                  )}
                  <button
                    onClick={() => onKill(s.name)}
                    className="text-red-600 hover:underline dark:text-red-400"
                  >
                    kill
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
