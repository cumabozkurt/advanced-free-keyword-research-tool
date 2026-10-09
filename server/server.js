#!/usr/bin/env node
/**
 * Local server: serves the web app AND an allow-listed suggestion proxy, so every
 * engine (including Amazon, Brave, Ecosia, Qwant, Walmart, TikTok…) works in the browser.
 *
 *   npm start                       -> http://localhost:8787
 *   node server/server.js --port 3000 --host 0.0.0.0
 *   node server/server.js --no-serp            (disable Google SERP page mining)
 *
 * Zero runtime dependencies for autocomplete. Google SERP mining (/api/serp) additionally needs the
 * optional `puppeteer-core` package (npm install) and a local Chrome/Chromium/Edge. Node 18+.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpFetcher } from '../lib/http-fetcher.js';
import { createProxy } from '../lib/proxy-core.js';
import { ENGINES } from '../web/js/engines.js';
import { createSerpBackend, serpAvailability } from '../lib/google-serp.js';
import { createSerpService } from '../lib/serp-service.js';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : (process.env[name.toUpperCase()] ?? def); };
const PORT = Number(arg('port', 8787));
const HOST = arg('host', '127.0.0.1');
// Which other web origins may call this proxy from a browser (comma separated, or "*").
// Same-origin use (the app served by this server) always works. Default also allows the public GitHub Pages app.
const ALLOWED_ORIGINS = String(arg('allow-origin', 'https://cumabozkurt.github.io')).split(',').map((x) => x.trim()).filter(Boolean);
const ROOT = resolve(fileURLToPath(new URL('../web/', import.meta.url)));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };

const flag = (name) => args.includes(`--${name}`);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// ---- Google SERP pagination (optional) ----
const SERP_BACKEND = arg('serp-backend', 'browser');
const SERP_BASE_URL = arg('serp-base-url', undefined); // tests only: point at a fake Google
let serp = null;
let serpInfo = { available: false, reason: 'disabled with --no-serp' };
if (!flag('no-serp')) {
  serpInfo = SERP_BACKEND === 'html' ? { available: true } : await serpAvailability({ chromePath: arg('serp-chrome', undefined) });
  if (serpInfo.available) {
    serp = createSerpService({
      backend: createSerpBackend({ backend: SERP_BACKEND, chromePath: arg('serp-chrome', undefined), headful: flag('serp-headful'), userDataDir: arg('serp-profile', undefined), baseUrl: SERP_BASE_URL }),
      options: { minGapMs: Math.max(SERP_BASE_URL ? 0 : 2000, Number(arg('serp-gap', 4000)) || 4000) },
    });
  }
}

/** /api/serp is only for the machine owner: loopback clients from this app or an allow-listed origin. */
function serpAllowed(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const proxy = createProxy({ fetcher: createHttpFetcher({ userAgent: arg('user-agent', undefined) }), limits: { exemptLoopback: true } });

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*')) return { 'Access-Control-Allow-Origin': '*' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return { Vary: 'Origin' };
}

const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...SECURITY_HEADERS, ...corsHeaders(res.req), ...headers });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') {
      const pna = req.headers['access-control-request-private-network'] ? { 'Access-Control-Allow-Private-Network': 'true' } : {};
      return send(res, 204, '', { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', ...pna });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, name: 'Advanced Free Keyword Research Tool proxy', engines: ENGINES.map((e) => e.id), serp: { available: Boolean(serp), backend: SERP_BACKEND, reason: serpInfo.reason || '', ...(serp ? serp.status() : {}) } }), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    }
    if (url.pathname === '/api/serp') {
      const json = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (!serpAllowed(req)) return send(res, 403, JSON.stringify({ status: 'forbidden', error: 'SERP mining is only available to loopback clients of this server' }), json);
      if (!serp) return send(res, 503, JSON.stringify({ status: 'unavailable', error: serpInfo.reason }), json);
      const { status, body } = await serp.handle(url.searchParams);
      return send(res, status, JSON.stringify(body), json);
    }
    if (url.pathname === '/api/suggest') {
      const ip = req.socket.remoteAddress || 'unknown';
      const { status, body } = await proxy(url.searchParams, ip);
      return send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    }

    // static files
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }
    if (p.includes('\0')) return send(res, 400, 'Bad request');
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) return send(res, 403, 'Forbidden');
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) return send(res, 404, 'Not found');
    const data = await readFile(file);
    return send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error(err);
    return send(res, 500, 'Internal error');
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') console.warn('  ⚠ Listening on a non-loopback address: anyone who can reach this port can use the proxy (rate-limited).');
  console.log(`\n  Advanced Free Keyword Research Tool\n  ▸ App:   http://${shown}:${PORT}/\n  ▸ Proxy: http://${shown}:${PORT}/api/suggest?engine=amazon&q=laptop\n\n  The web app auto-detects this proxy, so all ${ENGINES.length} engines are available.`);
  console.log(serp ? `  ▸ Google SERP pages: enabled (${SERP_BACKEND} backend; stops on CAPTCHA)\n` : `  ▸ Google SERP pages: off — ${serpInfo.reason}\n`);
});

const shutdown = async () => { try { await serp?.close(); } finally { process.exit(0); } };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
