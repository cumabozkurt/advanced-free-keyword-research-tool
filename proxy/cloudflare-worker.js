/**
 * Optional public proxy on Cloudflare Workers (free tier is plenty for personal use).
 * Lets the GitHub Pages app use engines that block browsers (Amazon, Brave, Ecosia, Qwant, Walmart…).
 *
 *   cd proxy && npx wrangler deploy
 *
 * Then paste the worker URL (https://afkrt-proxy.<you>.workers.dev) into the app's "Proxy URL" setting.
 * Set ALLOWED_ORIGINS in wrangler.toml to your Pages origin to stop others from using your quota.
 */
import { createHttpFetcher } from '../lib/http-fetcher.js';
import { createProxy } from '../lib/proxy-core.js';

const proxy = createProxy({ fetcher: createHttpFetcher(), limits: { perIpPerMinute: 1200 } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
    const allowOrigin = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
    const headers = { 'Access-Control-Allow-Origin': allowOrigin, 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET' } });
    if (!allowed.includes('*') && origin && !allowed.includes(origin)) return new Response('{"error":"origin not allowed"}', { status: 403, headers });
    if (url.pathname === '/api/health') return new Response('{"ok":true}', { headers });
    if (url.pathname !== '/api/suggest') return new Response('{"error":"not found"}', { status: 404, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { status, body } = await proxy(url.searchParams, ip);
    return new Response(JSON.stringify(body), { status, headers });
  },
};
