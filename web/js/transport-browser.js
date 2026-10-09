/**
 * Browser fetcher: JSONP → CORS → optional proxy (local server or Cloudflare Worker).
 */
import { ENGINE_MAP, parseJsonish } from './engines.js';

let counter = 0;
const fixedLocks = new Map();

/** JSONP with a callback name the server insists on (e.g. DuckDuckGo). Calls are serialised per name. */
function jsonpFixed(url, param, name, opts) {
  const prev = fixedLocks.get(name) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => jsonp(url, param, { ...opts, callbackName: name }));
  fixedLocks.set(name, run.catch(() => {}));
  return run;
}

/** Minimal, cleanup-safe JSONP. Only used for the fixed allow-listed engine hosts in engines.js. */
export function jsonp(url, param, { timeoutMs = 10000, signal, callbackName } = {}) {
  return new Promise((resolve, reject) => {
    const cb = callbackName || `__afkrt_${Date.now().toString(36)}_${(counter++).toString(36)}`;
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      clearTimeout(timer);
      // keep a no-op in case the response arrives late
      if (!callbackName) window[cb] = () => { delete window[cb]; };
      script.remove();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => { if (!done) { cleanup(); reject(new DOMException('Aborted', 'AbortError')); } };
    const timer = setTimeout(() => { if (!done) { cleanup(); reject(new Error('timeout')); } }, timeoutMs);
    window[cb] = (data) => { if (!done) { cleanup(); resolve(data); } };
    script.onerror = () => { if (!done) { cleanup(); reject(new Error('network/blocked')); } };
    script.src = `${url}${url.includes('?') ? '&' : '?'}${param}=${cb}`;
    script.referrerPolicy = 'no-referrer';
    script.async = true;
    signal?.addEventListener('abort', onAbort, { once: true });
    document.head.appendChild(script);
  });
}

async function fetchJson(url, { timeoutMs = 10000, signal } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseJsonish(await res.text());
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** How an engine will be reached in this browser given the proxy setting. */
export function browserMode(engine, proxyUrl) {
  if (engine.jsonp) return 'jsonp';
  if (engine.cors) return 'cors';
  if (proxyUrl) return 'proxy';
  return null;
}

export function createBrowserFetcher({ proxyUrl = '', preferProxy = false } = {}) {
  const proxy = proxyUrl.replace(/\/+$/, '');
  return async function fetcher(engineId, query, opts) {
    const e = ENGINE_MAP[engineId];
    if (!e) throw new Error(`unknown engine ${engineId}`);
    const mode = preferProxy && proxy ? 'proxy' : browserMode(e, proxy);
    if (mode === 'jsonp') {
      const data = e.jsonp.fixedCallback
        ? await jsonpFixed(e.jsonp.url(query, opts), e.jsonp.param, e.jsonp.fixedCallback, opts)
        : await jsonp(e.jsonp.url(query, opts), e.jsonp.param, opts);
      return e.jsonp.parse(data);
    }
    if (mode === 'cors') return e.cors.parse(await fetchJson(e.cors.url(query, opts), opts));
    if (mode === 'proxy') {
      const u = `${proxy}/api/suggest?engine=${encodeURIComponent(engineId)}&q=${encodeURIComponent(query)}&hl=${encodeURIComponent(opts.hl || '')}&gl=${encodeURIComponent(opts.gl || '')}`;
      const data = await fetchJson(u, opts);
      if (data.error) throw new Error(data.error);
      return data.suggestions || [];
    }
    throw new Error('needs proxy');
  };
}
