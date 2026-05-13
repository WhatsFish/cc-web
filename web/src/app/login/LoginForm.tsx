"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "totp" | "recovery";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || submitting) return;
    setSubmitting(true);
    setError(null);

    const body = mode === "totp" ? { code } : { recoveryCode: code };
    let r: Response;
    try {
      r = await fetch("/cc-web/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setSubmitting(false);
      setError("Network error");
      return;
    }

    setSubmitting(false);
    if (r.ok) {
      router.replace("/");
      router.refresh();
      return;
    }

    const data = (await r.json().catch(() => ({}))) as { error?: string; retryAfterSec?: number };
    if (r.status === 429) {
      const sec = data.retryAfterSec ?? 60;
      setError(
        data.error === "banned"
          ? `IP banned. Retry in ${Math.ceil(sec / 60)} min.`
          : `Too many attempts. Retry in ${sec}s.`,
      );
    } else if (r.status === 500 && data.error === "not_configured") {
      setError("Server not configured — run `npm run setup`.");
    } else {
      setError(mode === "totp" ? "Invalid code" : "Invalid recovery code");
    }
    setCode("");
  }

  function toggleMode() {
    setMode(mode === "totp" ? "recovery" : "totp");
    setCode("");
    setError(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">cc-web</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {mode === "totp"
          ? "Enter the 6-digit code from your authenticator."
          : "Enter one of your recovery codes."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="text"
          inputMode={mode === "totp" ? "numeric" : "text"}
          autoComplete={mode === "totp" ? "one-time-code" : "off"}
          autoCapitalize={mode === "totp" ? "off" : "characters"}
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={mode === "totp" ? "123456" : "ABCD-EFGH-JKMN"}
          maxLength={mode === "totp" ? 8 : 16}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-center font-mono text-lg tracking-widest text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting || !code}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "Verifying…" : "Sign in"}
        </button>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </form>

      <button
        onClick={toggleMode}
        className="mt-6 self-start text-xs text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
      >
        {mode === "totp" ? "Lost your phone? Use a recovery code." : "Back to authenticator code"}
      </button>
    </main>
  );
}
