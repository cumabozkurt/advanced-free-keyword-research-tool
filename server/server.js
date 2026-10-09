#!/usr/bin/env node
/**
 * Local server: serves the web app AND an allow-listed suggestion proxy, so every
 * engine (including Amazon, Brave, Ecosia, Qwant, Walmart, TikTok…) works in the browser.
 *
 *   npm start                       -> http://localhost:8787
 *   node server/server.js --port 3000 --host 0.0.0.0
 *
 * Zero dependencies. Node 18+.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpFetcher } from '../lib/http-fetcher.js';
import { createProxy } from '../lib/proxy-core.js';
import { ENGINES } from '../web/js/engines.js';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : (process.env[name.toUpperCase()] ?? def); };
const PORT = Number(arg('port', 8787));
const HOST = arg('host', '127.0.0.1');
const ALLOW_ORIGIN = arg('allow-origin', '*');
const ROOT = resolve(fileURLToPath(new URL('../web/', import.meta.url)));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };

const proxy = createProxy({ fetcher: createHttpFetcher({ userAgent: arg('user-agent', undefined) }) });

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Access-Control-Allow-Origin': ALLOW_ORIGIN, 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, name: 'Advanced Free Keyword Research Tool proxy', engines: ENGINES.map((e) => e.id) }), { 'Content-Type': 'application/json' });
    }
    if (url.pathname === '/api/suggest') {
      const ip = req.socket.remoteAddress || 'unknown';
      const { status, body } = await proxy(url.searchParams, ip);
      return send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    }

    // static files
    let p = decodeURIComponent(url.pathname);
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
  console.log(`\n  Advanced Free Keyword Research Tool\n  ▸ App:   http://${shown}:${PORT}/\n  ▸ Proxy: http://${shown}:${PORT}/api/suggest?engine=amazon&q=laptop\n\n  The web app auto-detects this proxy, so all ${ENGINES.length} engines are available.\n`);
});
