#!/usr/bin/env node
/**
 * Serves the production build (dist/setpoint/browser) the way GitHub Pages does, for Lighthouse CI
 * (lighthouserc.cjs). Build first: `npm run build -- --base-href /setpoint-beach-tennis/`.
 *
 * - Files are served under /setpoint-beach-tennis/, gzipped like Pages. Unknown paths get index.html
 *   (Pages answers them from 404.html with status 404; here the status is 200, which Lighthouse needs).
 * - Supabase is mocked on the same origin, so index.html and its Content-Security-Policy stay unchanged
 *   (connect-src 'self'): runtime-config.js points supabaseUrl at /setpoint-beach-tennis/__supabase, and
 *   get_local_live_tournament answers with the stored tournament fixture, so /?live= renders a real
 *   tournament. PostHog stays off (no key). Lighthouse also blocks the known external hosts (blockedUrlPatterns).
 *
 * Listens on http://127.0.0.1:4300 only (lighthouserc.cjs uses the same address). `npm run analyze` overwrites
 * dist/ without the base href, so build again before running Lighthouse.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BASE = '/setpoint-beach-tennis/';
const MOCK = `${BASE}__supabase/`;
const ROOT = path.join(__dirname, '..', 'dist', 'setpoint', 'browser');
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json');
const HOST = '127.0.0.1';
const PORT = 4300;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;

const INDEX = path.join(ROOT, 'index.html');
if (!fs.existsSync(INDEX) || !fs.readFileSync(INDEX, 'utf8').includes(`<base href="${BASE}">`)) {
  console.error(`No build with the ${BASE} base href in ${ROOT}. Run: npm run build -- --base-href ${BASE}`);
  process.exit(1);
}

/** The built runtime config, with Supabase pointed at the mock on this origin. */
function runtimeConfig(origin) {
  const built = fs.readFileSync(path.join(ROOT, 'runtime-config.js'), 'utf8');
  const json = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(built)?.[1];
  const config = {
    ...(json ? JSON.parse(json) : {}),
    supabaseUrl: `${origin}${MOCK.slice(0, -1)}`,
    publishableKey: 'lhci',
  };
  delete config.posthogKey;
  delete config.posthogHost;
  return `window.__SETPOINT_CONFIG__ = ${JSON.stringify(config)};\n`;
}

function liveTournament() {
  const state = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  return JSON.stringify({ id: 'lhci-live', status: 'active', state: { ...state, hostingMode: 'local' } });
}

function send(req, res, status, type, body) {
  const headers = { 'content-type': type, 'cache-control': 'no-cache' };
  let payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    payload = zlib.gzipSync(payload);
    headers['content-encoding'] = 'gzip';
    headers.vary = 'accept-encoding';
  }
  headers['content-length'] = payload.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function mockSupabase(req, res, pathname) {
  if (req.method === 'POST' && pathname === `${MOCK}rest/v1/rpc/get_local_live_tournament`) {
    console.log(`mock: ${req.method} ${pathname}`);
    return send(req, res, 200, TYPES['.json'], liveTournament());
  }
  console.log(`mock: unanswered ${req.method} ${pathname}`);
  return send(req, res, 404, TYPES['.json'], JSON.stringify({ message: `not mocked: ${pathname}` }));
}

function handle(req, res) {
  const origin = `http://${req.headers.host}`;
  const { pathname } = new URL(req.url, origin);
  if (pathname === '/' || pathname === BASE.slice(0, -1)) {
    res.writeHead(302, { location: BASE });
    return res.end();
  }
  if (!pathname.startsWith(BASE)) return send(req, res, 404, TYPES['.txt'], 'Not found');
  if (pathname.startsWith(MOCK)) return mockSupabase(req, res, pathname);
  if (pathname === `${BASE}runtime-config.js`) return send(req, res, 200, TYPES['.js'], runtimeConfig(origin));

  const file = path.resolve(ROOT, decodeURIComponent(pathname.slice(BASE.length)));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(req, res, 404, TYPES['.txt'], 'Not found');
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(req, res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  }
  if (path.extname(file)) return send(req, res, 404, TYPES['.txt'], 'Not found');
  return send(req, res, 200, TYPES['.html'], fs.readFileSync(INDEX));
}

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch {
    // A malformed address (bad %-encoding or Host header) must not stop the server.
    if (!res.headersSent) send(req, res, 400, TYPES['.txt'], 'Bad request');
  }
});

// Supabase realtime: refuse the socket. The live viewer also polls, which is enough for one page load.
server.on('upgrade', (_req, socket) => socket.destroy());

server.listen(PORT, HOST, () => console.log(`Serving dist on http://${HOST}:${PORT}${BASE}`));
