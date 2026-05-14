/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/cc-web",
  // Run via a custom server (server.ts) so we can attach a WebSocket
  // upgrade handler at /cc-web/ws/term/*. Standalone output isn't useful
  // in that mode — and Next emits a noisy warning if both are set.
};

module.exports = nextConfig;
