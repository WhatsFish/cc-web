// Project-wide constants. Keep this file free of imports from server-only
// modules so it can be used from anywhere.

export const DATA_DIR = process.env.CC_WEB_DATA_DIR ?? "/home/liharr/src/cc-web/data";

export const COOKIE_NAME = "cc-web-session";
// Cookie path matches the nginx basePath so the cookie scopes only to this app.
export const COOKIE_PATH = "/cc-web";

// Session lives 7 days from last activity (sliding refresh).
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Rate limit / ban thresholds for /api/login. Same window covers TOTP and
// recovery code paths so a "lost phone" attacker can't fan out across modes.
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_PER_WINDOW = 5;
export const BAN_AFTER_CONSECUTIVE_FAILURES = 10;
export const BAN_DURATION_MS = 60 * 60 * 1000;
