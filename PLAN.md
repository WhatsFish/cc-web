# cc-web — Web Console for Claude Code & Copilot CLI

Working title — rename before implementation.

## Purpose

Remote-control my CC / Copilot CLI sessions on this VM from any browser (phone, iPad, borrowed laptop). Single user, TOTP-only login. Public-internet exposed.

**In scope (v1)**: list/attach/create tmux-wrapped CLI sessions; terminal interaction "exactly like local"; minimal mobile affordances.

**Out of scope (v1)**: file upload UI, multi-user, session sharing/recording, AI-assisted prompt UI, in-browser file editor.

## Architecture

```
                  public internet
                        │
              nginx (443, LE cert)
                        │
              /cc-web/ → 127.0.0.1:3010
                        │
        ┌───────────────┴────────────────┐
        │  cc-web (systemd --user, host) │
        │   ├─ Next.js 14 (HTTP)         │
        │   ├─ ws server (PTY transport) │
        │   └─ node-pty                  │
        │   runs as uid=1000 (liharr)    │
        └───────────────┬────────────────┘
                        │
              tmux -S /tmp/tmux-1000/default
                        │
                claude / gh copilot / shell
```

### Deliberate departure from fleet convention: runs on host, not Docker

Every other service on this VM is dockerized. cc-web shouldn't be, because:

- Needs PTY allocation and tmux socket access at the host user's uid
- Needs to share `~/.claude/`, `~/.config/gh/` auth state with the host user who runs CC from ssh
- Needs to see the same `tmux ls` that I see when I ssh in

You *can* do all this in Docker (`--pid=host`, mount `/tmp/tmux-1000`, mount `~/.claude` and `~/.config/gh`, run as uid 1000). At that point the container shares so much host state that it provides no isolation, only complexity. Run it as a `systemd --user` service under `liharr` and the model is uniform.

`/status` HTTP probe still works the same way.

## Session model: tmux is the substrate

Every CLI session lives in tmux. This gives us, for free:
- Survives cc-web restart, nginx hiccup, network drop
- Enumerable via `tmux ls`
- Same session attachable from ssh and web simultaneously
- Native detach/reattach

Two entry paths:
- **From web**: "New session" → pick cwd (dropdown of `~/src/*`) + preset (Claude Code / Copilot / bash / custom) → backend runs `tmux new-session -d -s <id> -c <cwd> <cmd>`.
- **From ssh**: user runs `tmux new -s foo` themselves → auto-appears in web list.

Sessions started **outside** tmux (raw `claude` in an ssh terminal) are not attachable from the web — document this. A v2 shell wrapper can auto-wrap.

## Auth design (TOTP-only)

One screen, one input: 6-digit code. Plus a fallback "recovery code" link.

### Bootstrap (one-time)
```
npm run setup
```
Generates a random TOTP secret + 5 alphanumeric recovery codes. Prints:
- `otpauth://` URI as terminal QR (scan with MS Authenticator → "Other account")
- Recovery codes plaintext to stdout (save to password manager)

Persists:
- Secret → `~/.config/cc-web.env` mode 600
- Recovery code bcrypt hashes → `data/recovery.json`

### Verification
- `otplib` 30s window, ±1 window for clock drift
- **Replay guard**: persist `lastUsedCounter = floor(Date.now()/30000)`; reject codes whose counter ≤ last used. This is the single most important detail — without it, a passive observer in the same 30s window can replay.
- **Rate limit**: 5 attempts/IP/min; 10 consecutive failures → 1h IP ban. Persist banlist so restart doesn't wipe it.
- Recovery code: longer input (alphanumeric), consumed on use, separate from rate limit but still tracked.

### Session cookies
- `HttpOnly; Secure; SameSite=Strict`
- 7-day TTL, sliding refresh on every authenticated request
- Server-side records in `data/sessions.json` → revocable from a "Sessions" page (lists ip / ua / last seen / revoke button)

### Public-internet hardening (since we're not behind Tailscale)
- Login is the only unauthenticated surface; every other API requires a valid cookie
- Drop unauthenticated request logging to ≤5/min to avoid bot-noise filling disk
- TLS only (nginx redirects 80→443 — already true on this VM)
- nginx-level `limit_req` on `/cc-web/api/login` as belt-and-braces against single-IP brute force

This is good enough for **single user, personal scope**. It is NOT good enough for a second user or anything sensitive — at that point add WebAuthn / passkey.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 20 LTS | matches fleet |
| Framework | Next.js 14.2.18 App Router | `basePath: "/cc-web"`, `output: "standalone"` |
| Process supervisor | `systemd --user` | `~/.config/systemd/user/cc-web.service`, `loginctl enable-linger liharr` |
| HTTP | Next built-in | port `127.0.0.1:3010` |
| WebSocket | `ws` (raw), separate upgrade handler | reverse-proxied via nginx with `Upgrade` headers |
| PTY | `node-pty` | needs build-essential for native build |
| Terminal | `xterm.js` + addons: `fit`, `web-links`, `webgl` |
| TOTP | `otplib` |
| QR (setup script) | `qrcode-terminal` |
| Storage | flat JSON files under `data/` + atomic rename | no Postgres — volumes <10KB, single-writer |
| Hashing | `bcryptjs` for recovery codes |
| Logging | `pino` → stdout → journald |

**Port**: `3010` (next free after `youtube-clips=3008`).

## URL structure

| Path | Purpose |
|---|---|
| `/cc-web/` | Unauthed → `/login`. Authed → `/sessions`. |
| `/cc-web/login` | TOTP entry; "use recovery code" toggle |
| `/cc-web/sessions` | Tmux session list + "New" form + "Manage logins" link |
| `/cc-web/term/[id]` | Full-screen terminal attached to tmux session `<id>` |
| `/cc-web/logins` | Active cookies, revoke buttons |
| `/cc-web/api/login` | POST `{code}` → set cookie |
| `/cc-web/api/sessions` | GET list (`tmux ls -F`), POST create, DELETE kill |
| `/cc-web/ws/term/[id]` | WebSocket: PTY I/O |

## Mobile affordances (v1, minimal)

Above-terminal toolbar with: `Esc` `Tab` `Ctrl-C` `Ctrl-D` `↑` `↓` `↵`. Sticky bottom on phones (above iOS keyboard).

Slash-command picker / prompt snippets / file picker — all v2.

## Implementation phases

**Phase 0 — scaffold** (1 evening)
- Project skeleton, Next 14 standalone + basePath + Tailwind
- systemd user unit, nginx snippet `/etc/nginx/snippets/cc-web.conf`, LE cert (covered by existing wildcard / SAN), `/status` HTTP probe registered
- site-index entry

**Phase 1 — auth** (1 evening)
- Bootstrap script: secret + recovery codes + QR print
- `/login` page, TOTP verify, replay guard, rate limit, banlist persistence
- Session cookie middleware
- Recovery code path
- Smoke test from phone

**Phase 2 — terminal MVP** (1–2 evenings)
- `/sessions`: lists via `tmux ls -F '#{session_name}|#{session_created}|#{session_attached}'`
- New-session form (preset + `~/src/*` cwd dropdown)
- `/term/[id]`: xterm.js mounts → WS opens → backend spawns `tmux attach -t <id>` inside node-pty → bidir pipe → resize messages → fit addon on browser resize
- Kill-session button
- `/logins` page

**Phase 3 — polish & expose** (1 evening)
- Mobile key bar
- Favicon, site-index card
- Public exposure checklist (below)
- Recovery flow dry-run from cold

**Total**: 4–5 evenings to publicly accessible v1.

## Public exposure checklist (block on these before opening)

- [ ] nginx `limit_req` rule on `/cc-web/api/login` (e.g. 10r/m burst 5)
- [ ] Banlist persists across restart (verified by killing service mid-ban)
- [ ] Replay guard verified: same code rejected twice
- [ ] Recovery codes saved to password manager
- [ ] TOTP secret backed up to password manager (so phone loss isn't terminal)
- [ ] Confirm 401 responses don't fill `journalctl -u cc-web.service` faster than 5 lines/min under bot pressure (curl-loop test)
- [ ] Confirm `tmux kill-session` accessible only via authed API, not URL-fuzzable
- [ ] Session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/cc-web`

## Data layout

```
src/cc-web/
  data/                    # gitignored
    auth-state.json        # { lastUsedCounter }
    recovery.json          # [ { hash, usedAt|null } ]
    sessions.json          # [ { id, ip, ua, createdAt, lastSeenAt } ]
    banned.json            # { "<ip>": expiresAtMs }
  scripts/
    setup.ts               # bootstrap secret + recovery codes
  web/                     # Next.js app
  systemd/
    cc-web.service         # template
```

Secrets in `~/.config/cc-web.env`:
```
CC_WEB_TOTP_SECRET=...
CC_WEB_COOKIE_KEY=...          # HMAC key for cookie signing
```

## Resolved decisions

1. **Scope**: generic-CLI session manager. Built-in presets for `claude`, `gh copilot`, `bash`. Any other command also supported via free-text input.
2. **Project name**: `cc-web`.
3. **URL shape**: `/cc-web/` under the existing domain (path, not subdomain).
4. **systemd user PATH**: explicit `Environment=PATH=...` in the unit. Determine concrete paths during Phase 0 via `which claude`, `which gh`, `which tmux`, `which node`.
5. **TOTP secret backup**: bootstrap script prints both the QR code AND the plaintext base32 secret + recovery codes, so all three go into the password manager. Recovery codes remain the fallback when even the password manager is lost.

---

**Status**: Phase 0 in progress.
