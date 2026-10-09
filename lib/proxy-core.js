/**
 * Shared logic for the suggestion proxy (local Node server + Cloudflare Worker).
 * NOT an open proxy: only engine ids from the registry are accepted, and the
 * upstream URL is always built server-side from engines.js.
 */
import { ENGINE_MAP } from '../web/js/engines.js';

export const LIMITS = { maxQueryLength: 200, cacheTtlMs: 6 * 60 * 60 * 1000, cacheMax: 5000, perIpPerMinute: 120, perEngineGapMs: 250 };

export function createProxy({ fetcher, limits = {} }) {
  const L = { ...LIMITS, ...limits };
  const cache = new Map();
  const ipHits = new Map();
  const lastEngineCall = new Map();

  const rateLimited = (ip) => {
    const now = Date.now();
    const rec = ipHits.get(ip) || { start: now, n: 0 };
    if (now - rec.start > 60000) { rec.start = now; rec.n = 0; }
    rec.n += 1;
    ipHits.set(ip, rec);
    if (ipHits.size > 10000) ipHits.clear();
    return rec.n > L.perIpPerMinute;
  };

  /** @returns {Promise<{status:number, body:object}>} */
  return async function handle(params, ip = 'local') {
    const engine = String(params.get('engine') || '');
    const q = String(params.get('q') || '').trim();
    const hl = String(params.get('hl') || 'en').slice(0, 10).replace(/[^a-zA-Z-]/g, '');
    const gl = String(params.get('gl') || 'us').slice(0, 5).replace(/[^a-zA-Z]/g, '');
    if (!ENGINE_MAP[engine]) return { status: 400, body: { error: 'unknown engine', engines: Object.keys(ENGINE_MAP) } };
    if (!q) return { status: 400, body: { error: 'missing q' } };
    if (q.length > L.maxQueryLength) return { status: 400, body: { error: 'query too long' } };
    if (rateLimited(ip)) return { status: 429, body: { error: 'rate limited, slow down' } };

    const key = `${engine}|${hl}|${gl}|${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < L.cacheTtlMs) return { status: 200, body: { engine, q, suggestions: hit.s, cached: true } };

    // be polite: keep a small gap between upstream calls to the same engine
    const last = lastEngineCall.get(engine) || 0;
    const wait = last + L.perEngineGapMs - Date.now();
    lastEngineCall.set(engine, Math.max(Date.now(), last + L.perEngineGapMs));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    try {
      const s = await fetcher(engine, q, { hl, gl, timeoutMs: 10000 });
      cache.set(key, { t: Date.now(), s });
      if (cache.size > L.cacheMax) cache.delete(cache.keys().next().value);
      return { status: 200, body: { engine, q, suggestions: s } };
    } catch (err) {
      return { status: 502, body: { engine, q, error: `upstream: ${err.message || err}` } };
    }
  };
}
