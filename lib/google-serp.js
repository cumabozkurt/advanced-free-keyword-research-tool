/**
 * Google SERP page fetchers for Node (CLI / local server). NOT usable from GitHub Pages:
 * browsers cannot read google.com/search cross-origin, and Google requires JavaScript.
 *
 * Backends
 *   - "browser" (default): drives YOUR installed Chrome / Chromium / Edge through puppeteer-core
 *     (optional dependency: `npm install`). Plain automation — no stealth plugins, no fingerprint
 *     spoofing, no CAPTCHA solving, no proxy rotation. If Google shows a CAPTCHA we stop.
 *   - "html": plain HTTP fetch. As of 2026 Google answers non-JS clients with a JavaScript wall,
 *     so this backend mostly reports "jswall"; kept for transparency and future changes.
 *
 * Note: automated access to Google Search result pages is against Google's Terms of Service.
 * Use small page counts, long delays, and only for your own research. See README.
 */
import { existsSync } from 'node:fs';
import { parseGoogleSerp } from './serp-parse.js';
import { SerpBlockedError } from '../web/js/serp-client.js';
import { isValidLang, isValidCountry } from '../web/js/engines.js';

export function buildSerpUrl(query, { hl = 'tr', gl = 'tr', page = 0, baseUrl = 'https://www.google.com' } = {}) {
  if (!isValidLang(hl) || !isValidCountry(gl)) throw new Error('invalid hl/gl');
  const base = hl.split('-')[0];
  const lr = hl.includes('-') ? `lang_${base}-${hl.split('-')[1].toUpperCase()}` : `lang_${base}`;
  const p = new URLSearchParams({ q: query, hl, gl: gl.toLowerCase(), lr, pws: '0', start: String(page * 10) });
  if (page === 0) p.delete('start');
  return `${baseUrl.replace(/\/+$/, '')}/search?${p}`;
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export const findChrome = (explicit) => (explicit && existsSync(explicit) ? explicit : CHROME_CANDIDATES.find((p) => existsSync(p)) || null);

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    return null;
  }
}

/** Is the browser backend usable on this machine? */
export async function serpAvailability({ chromePath } = {}) {
  const chrome = findChrome(chromePath);
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) return { available: false, reason: 'puppeteer-core not installed — run `npm install`' };
  if (!chrome) return { available: false, reason: 'Chrome/Chromium/Edge not found — install it or set CHROME_PATH' };
  return { available: true, chrome };
}

/**
 * Real-browser backend. One browser + one tab, pages loaded strictly one after another.
 * @returns {{ fetchPage: Function, close: Function }}
 */
export function createBrowserSerpBackend({ chromePath, headful = false, userDataDir, baseUrl, navTimeoutMs = 30000 } = {}) {
  let browserPromise = null;
  let pagePromise = null;
  let chain = Promise.resolve();

  const getPage = async () => {
    if (!browserPromise) {
      browserPromise = (async () => {
        const puppeteer = await loadPuppeteer();
        if (!puppeteer) throw new SerpBlockedError('unavailable', 'puppeteer-core not installed — run `npm install`');
        const executablePath = findChrome(chromePath);
        if (!executablePath) throw new SerpBlockedError('unavailable', 'Chrome/Chromium/Edge not found — set CHROME_PATH');
        return puppeteer.launch({
          executablePath,
          headless: !headful,
          userDataDir,
          // --no-sandbox only where Chrome's sandbox cannot work (root / CI containers); opt in with AFKRT_CHROME_NO_SANDBOX=1
          args: process.getuid?.() === 0 || process.env.AFKRT_CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
          defaultViewport: { width: 1280, height: 900 },
        });
      })();
    }
    const browser = await browserPromise;
    if (!pagePromise) pagePromise = browser.newPage();
    return pagePromise;
  };

  const fetchOne = async (query, pageIndex, { hl, gl, signal } = {}) => {
    if (signal?.aborted) throw new Error('aborted');
    const tab = await getPage();
    const url = buildSerpUrl(query, { hl, gl, page: pageIndex, baseUrl });
    const resp = await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
    // give client-side rendering a moment; stop early if results / captcha are present
    await tab.waitForSelector('#search, #rso, h3, form#captcha-form, #recaptcha', { timeout: 8000 }).catch(() => {});
    const html = await tab.content();
    const finalUrl = tab.url();
    const parsed = parseGoogleSerp(html, { query, page: pageIndex, finalUrl });
    if (parsed.status === 'ok' && resp && resp.status() === 429) parsed.status = 'captcha';
    return parsed;
  };

  return {
    // serialise: never two Google page loads at the same time
    fetchPage: (q, p, o) => { const run = chain.then(() => fetchOne(q, p, o)); chain = run.catch(() => {}); return run; },
    async close() {
      if (!browserPromise) return;
      try { (await browserPromise).close(); } catch { /* already closed */ }
      browserPromise = null; pagePromise = null;
    },
  };
}

/** Plain HTTP backend (no JavaScript). Usually returns status "jswall" today. */
export function createHtmlSerpBackend({ userAgent = 'Mozilla/5.0 (compatible; AdvancedFreeKeywordResearchTool/1.0)', baseUrl, fetchImpl = globalThis.fetch } = {}) {
  return {
    async fetchPage(query, pageIndex, { hl, gl, signal } = {}) {
      const url = buildSerpUrl(query, { hl, gl, page: pageIndex, baseUrl });
      const res = await fetchImpl(url, { signal, redirect: 'follow', headers: { 'User-Agent': userAgent, 'Accept-Language': `${hl},en;q=0.5` } });
      const html = await res.text();
      const parsed = parseGoogleSerp(html, { query, page: pageIndex, finalUrl: res.url });
      if (res.status === 429 && parsed.status === 'ok') parsed.status = 'captcha';
      return parsed;
    },
    async close() {},
  };
}

export function createSerpBackend({ backend = 'browser', ...opts } = {}) {
  if (backend === 'html') return createHtmlSerpBackend(opts);
  if (backend === 'browser') return createBrowserSerpBackend(opts);
  throw new Error(`unknown SERP backend "${backend}" (use browser or html)`);
}
