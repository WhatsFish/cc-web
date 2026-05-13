import { requireAuth } from "@/lib/auth/require";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireAuth();
  const since = new Date(session.createdAt).toISOString().replace("T", " ").slice(0, 19) + "Z";

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">cc-web</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        Signed in. Session list and terminal attach land in Phase 2.
      </p>

      <dl className="mt-8 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs font-mono text-neutral-500 dark:text-neutral-400">
        <dt>signed in</dt><dd>{since}</dd>
        <dt>from</dt><dd>{session.ip}</dd>
      </dl>

      <div className="mt-8 flex items-center gap-3">
        <span className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-mono text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          phase 1 — auth
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
