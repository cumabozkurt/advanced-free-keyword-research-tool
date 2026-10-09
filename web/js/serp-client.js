/**
 * Google SERP pagination phase, shared by the web app (via the local server) and the CLI.
 *
 * It walks result pages 1..N for every seed, merges related searches / People-also-ask /
 * organic titles into the Miner's de-duplicated results, and STOPS for good on CAPTCHA,
 * consent or JavaScript walls. There is no evasion: no proxy rotation, no CAPTCHA solving.
 *
 * fetchPage(query, pageIndex, { hl, gl, signal }) -> { status, related, paa, organic, hasNext }
 */

export const SERP_SOURCES = { related: 'serp-related', paa: 'serp-paa', organic: 'serp-organic' };
export const SERP_ENGINE_ID = 'google-serp';
export const SERP_LIMITS = { minPages: 1, maxPages: 100, defaultPages: 10, minDelayMs: 2000, defaultDelayMs: 5000 };

export class SerpBlockedError extends Error {
  constructor(status, detail = '') {
    super(detail || `Google ${status}`);
    this.name = 'SerpBlockedError';
    this.status = status;
  }
}

const BLOCK_STATUSES = new Set(['captcha', 'consent', 'jswall', 'blocked', 'unavailable']);

const sleep = (ms, signal) => new Promise((resolve) => {
  if (ms <= 0 || signal?.aborted) return resolve();
  const onAbort = () => { clearTimeout(t); resolve(); };
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export const clampPages = (n) => {
  const x = Number(n);
  return Math.min(SERP_LIMITS.maxPages, Math.max(SERP_LIMITS.minPages, Math.round(Number.isFinite(x) ? x : SERP_LIMITS.defaultPages)));
};

/**
 * @param {object} p
 * @param {import('./miner.js').Miner} p.miner   results are merged into this miner (dedupe, events, stats)
 * @param {string[]} p.seeds
 * @param {Function} p.fetchPage
 * @param {number} [p.pages=10]  pages per seed (1–100)
 * @param {string[]} [p.sources=['related','paa']]
 * @param {number} [p.delayMs=5000]  pause between two page loads (min 2000)
 * @param {(s:object)=>void} [p.onStatus]
 * @param {number} [p.minDelayMs=2000]  lower bound for delayMs (tests may lower it)
 * @returns {Promise<{pages:number, found:number, blocked:string|null}>}
 */
export async function runSerpPhase({ miner, seeds, fetchPage, pages = SERP_LIMITS.defaultPages, sources = ['related', 'paa'], delayMs = SERP_LIMITS.defaultDelayMs, hl, gl, onStatus = () => {}, minDelayMs = SERP_LIMITS.minDelayMs }) {
  const maxPages = clampPages(pages);
  const d = Number(delayMs);
  const delay = Math.max(minDelayMs, Number.isFinite(d) ? d : SERP_LIMITS.defaultDelayMs);
  const signal = miner.abort.signal;
  const st = (miner.stats.perEngine[SERP_ENGINE_ID] ||= { requests: 0, ok: 0, errors: 0, found: 0, suggestions: 0, disabled: false, lastError: '' });
  const summary = { pages: 0, found: 0, blocked: null };
  let first = true;

  outer:
  for (const seed of seeds) {
    for (let page = 0; page < maxPages; page++) {
      if (signal.aborted) break outer;
      while (miner.paused && !signal.aborted) await sleep(200, signal);
      if (!first) await sleep(delay, signal);
      first = false;
      if (signal.aborted) break outer;
      onStatus({ type: 'page', seed, page: page + 1, pages: maxPages });
      st.requests += 1;
      let res;
      try {
        res = await fetchPage(seed, page, { hl: hl ?? miner.o.hl, gl: gl ?? miner.o.gl, signal });
      } catch (err) {
        if (signal.aborted) break outer;
        if (err instanceof SerpBlockedError || BLOCK_STATUSES.has(err?.status)) {
          res = { status: err.status || 'blocked', error: err.message };
        } else {
          st.errors += 1; st.lastError = String(err?.message || err);
          onStatus({ type: 'error', seed, page: page + 1, error: st.lastError });
          if (st.errors >= 3) { summary.blocked = 'errors'; break outer; }
          continue;
        }
      }
      if (BLOCK_STATUSES.has(res.status)) {
        // Respect the block: stop ALL SERP work for this run; autocomplete engines keep going.
        st.disabled = true; st.lastError = res.error || res.status;
        summary.blocked = res.status;
        onStatus({ type: 'blocked', seed, page: page + 1, status: res.status, error: res.error });
        miner.emitProgress();
        break outer;
      }
      st.ok += 1;
      summary.pages += 1;
      const task = { seed, q: seed, strategy: `serp-page-${page + 1}`, depth: 0 };
      for (const kind of sources) {
        const list = res[kind] || [];
        st.suggestions += list.length;
        for (const kw of list) {
          if (miner.addResult(kw, SERP_SOURCES[kind], task)) { st.found += 1; summary.found += 1; }
        }
      }
      miner.emitProgress();
      if (!res.hasNext || res.status === 'empty') {
        onStatus({ type: 'end', seed, page: page + 1 });
        break; // Google has no more pages for this seed
      }
    }
  }
  onStatus({ type: 'done', ...summary });
  return summary;
}
