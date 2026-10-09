/**
 * HTTP fetcher for Node 18+ (CLI, local server, GitHub Action) and edge runtimes (Cloudflare Workers).
 * Uses the `http` transport of each engine. No dependencies.
 */
import { ENGINE_MAP, parseJsonish } from '../web/js/engines.js';

export const DEFAULT_USER_AGENT =
  'AdvancedFreeKeywordResearchTool/1.0 (+https://github.com/cumabozkurt/advanced-free-keyword-research-tool)';

export const parseBody = parseJsonish;

export function createHttpFetcher({ userAgent = DEFAULT_USER_AGENT, fetchImpl = globalThis.fetch } = {}) {
  return async function fetcher(engineId, query, opts = {}) {
    const e = ENGINE_MAP[engineId];
    if (!e) throw new Error(`unknown engine: ${engineId}`);
    const url = e.http.url(query, opts);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), opts.timeoutMs || 10000);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener?.('abort', onAbort, { once: true });
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json, text/javascript, */*;q=0.1',
          'Accept-Language': `${opts.hl || 'en'}-${(opts.gl || 'us').toUpperCase()},${opts.hl || 'en'};q=0.9`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const headerCharset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1];
      let text;
      try {
        text = new TextDecoder(e.http.charset || headerCharset || 'utf-8').decode(buf);
      } catch {
        text = new TextDecoder('utf-8').decode(buf);
      }
      return e.http.parse(parseBody(text));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener?.('abort', onAbort);
    }
  };
}
