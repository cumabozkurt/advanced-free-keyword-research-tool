/**
 * /api/serp handler for the local server: one Google result page per request, parsed to
 * keyword fields only (related searches, People-also-ask, organic titles). Raw HTML is never returned.
 *
 * Politeness built in (server-wide, independent of what the client asks for):
 *   - page loads are serialised (one at a time) with a minimum gap (default 4 s)
 *   - after a CAPTCHA / block, all SERP requests are refused for a cool-down (default 15 min)
 *   - results are cached (6 h) so re-runs do not hit Google again
 */
import { isValidLang, isValidCountry, DEFAULT_LOCALE } from '../web/js/engines.js';
import { SERP_LIMITS } from '../web/js/serp-client.js';

export const SERP_SERVICE_DEFAULTS = { minGapMs: 4000, cooldownMs: 15 * 60 * 1000, cacheTtlMs: 6 * 60 * 60 * 1000, cacheMax: 2000, maxQueryLength: 200 };

const BLOCKED = new Set(['captcha', 'consent', 'jswall']);

export function createSerpService({ backend, options = {}, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const O = { ...SERP_SERVICE_DEFAULTS, ...options };
  const cache = new Map();
  let chain = Promise.resolve();
  let lastLoad = 0;
  let blockedUntil = 0;
  let blockedStatus = '';

  const status = () => ({ blocked: now() < blockedUntil, blockedStatus: now() < blockedUntil ? blockedStatus : '', blockedUntil: now() < blockedUntil ? blockedUntil : 0, minGapMs: O.minGapMs });

  async function load(q, page, hl, gl) {
    if (now() < blockedUntil) return { status: blockedStatus || 'captcha', cooldown: true, related: [], paa: [], organic: [], hasNext: false };
    const wait = lastLoad + O.minGapMs - now();
    if (wait > 0) await sleep(wait);
    lastLoad = now();
    const res = await backend.fetchPage(q, page, { hl, gl });
    lastLoad = now();
    if (BLOCKED.has(res.status)) { blockedUntil = now() + O.cooldownMs; blockedStatus = res.status; }
    return res;
  }

  /** @returns {Promise<{status:number, body:object}>} */
  async function handle(params) {
    const q = String(params.get('q') || '').trim();
    const page = Number(params.get('page') ?? 0);
    const hl = String(params.get('hl') || DEFAULT_LOCALE.hl).toLowerCase();
    const gl = String(params.get('gl') || DEFAULT_LOCALE.gl).toLowerCase();
    if (!q) return { status: 400, body: { error: 'missing q' } };
    if (q.length > O.maxQueryLength) return { status: 400, body: { error: 'query too long' } };
    if (!Number.isInteger(page) || page < 0 || page >= SERP_LIMITS.maxPages) return { status: 400, body: { error: `page must be 0–${SERP_LIMITS.maxPages - 1}` } };
    if (!isValidLang(hl) || !isValidCountry(gl)) return { status: 400, body: { error: 'invalid hl/gl' } };

    const key = `${hl}|${gl}|${page}|${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && now() - hit.t < O.cacheTtlMs) return { status: 200, body: { ...hit.body, cached: true } };

    const run = chain.then(() => load(q, page, hl, gl));
    chain = run.catch(() => {});
    try {
      const r = await run;
      const body = { q, page, status: r.status, related: r.related || [], paa: r.paa || [], organic: r.organic || [], hasNext: Boolean(r.hasNext) };
      if (r.cooldown) body.cooldownUntil = blockedUntil;
      if (r.status === 'ok' || r.status === 'empty') {
        cache.set(key, { t: now(), body });
        if (cache.size > O.cacheMax) cache.delete(cache.keys().next().value);
      }
      return { status: 200, body };
    } catch (err) {
      const blocked = err?.status === 'unavailable';
      return { status: blocked ? 503 : 502, body: { q, page, status: blocked ? 'unavailable' : 'error', error: String(err?.message || err) } };
    }
  }

  return { handle, status, close: () => backend.close?.() };
}
