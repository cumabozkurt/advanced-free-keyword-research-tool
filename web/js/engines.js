/**
 * Engine registry — the heart of Advanced Free Keyword Research Tool.
 *
 * Every engine describes up to three ways of fetching suggestions:
 *   - jsonp: works directly from a static page (GitHub Pages) via <script> injection
 *   - cors:  works directly from a static page via fetch() because the endpoint sends CORS headers
 *   - http:  plain HTTP for Node (CLI / local server / proxy). Always present.
 *
 * Each transport has `url(query, opts)` and `parse(data) -> string[]`.
 * `opts` = { hl: 'en', gl: 'us' } (language + country).
 *
 * Endpoints were verified live on 2026-10-09. They are unofficial and may change;
 * run `npm run check` to re-test them. See docs/ENDPOINTS.md.
 */

const enc = encodeURIComponent;

/** Strip HTML tags/entities that some engines embed (<b>…</b>). */
export function cleanText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const asStrings = (arr) => (Array.isArray(arr) ? arr : [])
  .map((x) => (Array.isArray(x) ? x[0] : (x && typeof x === 'object' ? (x.value ?? x.phrase ?? x.text ?? '') : x)))
  .map(cleanText)
  .filter(Boolean);

/** OpenSearch format: ["query", ["s1","s2",...], ...] */
const openSearch = (d) => asStrings(Array.isArray(d) ? d[1] : []);

const lang = (o) => (o.hl || 'en').toLowerCase();
const country = (o) => (o.gl || 'us').toLowerCase();

// ---------- Google family (suggestqueries.google.com, JSONP via `callback`) ----------
function googleEngine(id, name, ds, category, extra = {}) {
  const base = (q, o) =>
    `https://suggestqueries.google.com/complete/search?client=chrome&ie=utf-8&oe=utf-8&hl=${enc(lang(o))}&gl=${enc(country(o))}` +
    (ds ? `&ds=${ds}` : '') + `&q=${enc(q)}`;
  return {
    id, name, category, backend: 'Google', ...extra,
    jsonp: { url: base, param: 'callback', parse: openSearch },
    http: { url: base, parse: openSearch },
  };
}

// ---------- Amazon marketplaces ----------
export const AMAZON_MARKETS = {
  us: ['amazon.com', 'ATVPDKIKX0DER'], gb: ['amazon.co.uk', 'A1F83G8C2ARO7P'], uk: ['amazon.co.uk', 'A1F83G8C2ARO7P'],
  de: ['amazon.de', 'A1PA6795UKMFR9'], fr: ['amazon.fr', 'A13V1IB3VIYZZH'], it: ['amazon.it', 'APJ6JRA9NG5V4'],
  es: ['amazon.es', 'A1RKKUPIHCS9HS'], tr: ['amazon.com.tr', 'A33AVAJ2PDY3EV'], jp: ['amazon.co.jp', 'A1VC38T7YXB528'],
  ca: ['amazon.ca', 'A2EUQ1WTGCTBG2'], in: ['amazon.in', 'A21TJRUUN4KGV'], br: ['amazon.com.br', 'A2Q3Y263D00KWC'],
  mx: ['amazon.com.mx', 'A1AM78C64UM0Y8'], au: ['amazon.com.au', 'A39IBJ37TRP1C6'], nl: ['amazon.nl', 'A1805IZSGTT6HS'],
};
const amazonMarket = (o) => AMAZON_MARKETS[country(o)] || AMAZON_MARKETS.us;

// ---------- eBay sites ----------
const EBAY_SITES = { us: 0, ca: 2, gb: 3, uk: 3, au: 15, at: 16, fr: 71, de: 77, it: 101, nl: 146, es: 186, ch: 193, ie: 205, pl: 212 };

// ---------- DuckDuckGo region ----------
const ddgRegion = (o) => (o.gl ? `${country(o)}-${lang(o)}` : 'wt-wt');

/** Remove a JSONP / JS function wrapper and return the JSON payload text. */
export function unwrapJsonp(text) {
  const t = String(text).trim();
  if (t.startsWith('[') || t.startsWith('{')) return t;
  const start = t.indexOf('(');
  const end = t.lastIndexOf(')');
  if (start === -1 || end === -1 || end < start) return t;
  return t.slice(start + 1, end);
}

/** Parse JSON that may be wrapped in a JSONP/JS call, e.g. cb([...]) or fn([...], -1). */
export function parseJsonish(text) {
  const payload = unwrapJsonp(text);
  try {
    return JSON.parse(payload);
  } catch (err) {
    try { return JSON.parse(`[${payload}]`)[0]; } catch { throw err; }
  }
}

export const ENGINES = [
  // ---------------- Web search ----------------
  googleEngine('google', 'Google', '', 'web'),
  {
    id: 'bing', name: 'Bing', category: 'web', backend: 'Bing',
    jsonp: {
      url: (q, o) => `https://api.bing.com/osjson.aspx?JsonType=callback&market=${enc(lang(o))}-${enc(country(o).toUpperCase())}&query=${enc(q)}`,
      param: 'JsonCallback', parse: openSearch,
    },
    http: { url: (q, o) => `https://api.bing.com/osjson.aspx?market=${enc(lang(o))}-${enc(country(o).toUpperCase())}&query=${enc(q)}`, parse: openSearch },
  },
  {
    id: 'yahoo', name: 'Yahoo', category: 'web', backend: 'Yahoo (Bing index)',
    jsonp: {
      url: (q) => `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&nresults=10&command=${enc(q)}`,
      param: 'callback', parse: (d) => asStrings((d?.r || []).map((x) => x.k)),
    },
    http: {
      url: (q) => `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&nresults=10&command=${enc(q)}`,
      parse: (d) => asStrings((d?.r || []).map((x) => x.k)),
    },
  },
  {
    id: 'duckduckgo', name: 'DuckDuckGo', category: 'web', backend: 'DuckDuckGo',
    // DDG only honours this exact callback name, so requests are serialised in the browser.
    jsonp: { url: (q, o) => `https://duckduckgo.com/ac/?kl=${enc(ddgRegion(o))}&q=${enc(q)}`, param: 'callback', fixedCallback: 'autocompleteCallback', parse: asStrings },
    http: { url: (q, o) => `https://duckduckgo.com/ac/?kl=${enc(ddgRegion(o))}&q=${enc(q)}`, parse: asStrings },
  },
  {
    id: 'yandex', name: 'Yandex', category: 'web', backend: 'Yandex',
    // JSONP exists but Chrome blocks it (ORB: content-disposition attachment + nosniff) -> proxy/CLI only
    http: { url: (q, o) => `https://suggest.yandex.com/suggest-ff.cgi?uil=${enc(lang(o))}&part=${enc(q)}`, parse: openSearch },
  },
  {
    id: 'baidu', name: 'Baidu', category: 'web', backend: 'Baidu', region: 'CN',
    jsonp: { url: (q) => `https://suggestion.baidu.com/su?ie=utf-8&wd=${enc(q)}`, param: 'cb', parse: (d) => asStrings(d?.s) },
    http: { url: (q) => `https://www.baidu.com/sugrec?ie=utf-8&prod=pc&wd=${enc(q)}`, parse: (d) => asStrings((d?.g || []).map((x) => x.q)) },
  },
  {
    id: 'naver', name: 'Naver', category: 'web', backend: 'Naver', region: 'KR',
    jsonp: {
      url: (q) => `https://ac.search.naver.com/nx/ac?con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100&q=${enc(q)}`,
      param: '_callback', parse: (d) => asStrings(d?.items?.[0]),
    },
    http: {
      url: (q) => `https://ac.search.naver.com/nx/ac?con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100&q=${enc(q)}`,
      parse: (d) => asStrings(d?.items?.[0]),
    },
  },
  {
    id: 'so360', name: '360 Search', category: 'web', backend: 'Qihoo 360', region: 'CN',
    jsonp: {
      url: (q) => `https://sug.so.360.cn/suggest?encodein=utf-8&encodeout=utf-8&word=${enc(q)}`,
      param: 'callback', parse: (d) => asStrings((d?.result || []).map((x) => x.word)),
    },
    http: {
      url: (q) => `https://sug.so.360.cn/suggest?encodein=utf-8&encodeout=utf-8&format=json&word=${enc(q)}`,
      parse: (d) => asStrings((d?.result || []).map((x) => x.word)),
    },
  },
  {
    id: 'swisscows', name: 'Swisscows', category: 'web', backend: 'Swisscows',
    // Sends ACAO:* to curl but not to real browsers -> proxy/CLI only
    http: {
      url: (q, o) => `https://api.swisscows.com/suggest?locale=${enc(lang(o))}-${enc(country(o).toUpperCase())}&query=${enc(q)}`,
      parse: asStrings,
    },
  },
  {
    id: 'seznam', name: 'Seznam', category: 'web', backend: 'Seznam', region: 'CZ',
    cors: {
      url: (q) => `https://suggest.seznam.cz/fulltext/cs?count=10&phrase=${enc(q)}`,
      parse: (d) => asStrings((d?.result || []).map((r) => (r.text || []).map((t) => t.text).join(''))),
    },
    http: {
      url: (q) => `https://suggest.seznam.cz/fulltext/cs?count=10&phrase=${enc(q)}`,
      parse: (d) => asStrings((d?.result || []).map((r) => (r.text || []).map((t) => t.text).join(''))),
    },
  },
  // Proxy / CLI only (no CORS, no JSONP)
  {
    id: 'brave', name: 'Brave Search', category: 'web', backend: 'Brave', experimental: true,
    http: { url: (q, o) => `https://search.brave.com/api/suggest?rich=false&country=${enc(country(o))}&q=${enc(q)}`, parse: openSearch },
  },
  {
    id: 'ecosia', name: 'Ecosia', category: 'web', backend: 'Ecosia (Bing/Google)',
    http: { url: (q, o) => `https://ac.ecosia.org/?type=list&mkt=${enc(lang(o))}-${enc(country(o))}&q=${enc(q)}`, parse: openSearch },
  },
  {
    id: 'qwant', name: 'Qwant', category: 'web', backend: 'Qwant (Bing)',
    http: {
      url: (q, o) => `https://api.qwant.com/v3/suggest?locale=${enc(lang(o))}_${enc(country(o).toUpperCase())}&q=${enc(q)}`,
      parse: (d) => asStrings((d?.data?.items || []).map((x) => x.value)),
    },
  },
  {
    id: 'sogou', name: 'Sogou', category: 'web', backend: 'Sogou (Tencent)', region: 'CN',
    http: {
      url: (q) => `https://sor.html5.qq.com/api/getsug?m=afkrt&key=${enc(q)}`,
      charset: 'gbk',
      parse: (d) => asStrings(Array.isArray(d) ? d[1] : []),
    },
  },
  {
    id: 'quark', name: 'Quark / Shenma', category: 'web', backend: 'Alibaba', region: 'CN',
    http: { url: (q) => `https://sugs.m.sm.cn/web?q=${enc(q)}`, parse: (d) => asStrings((d?.r || []).map((x) => x.w)) },
  },

  // ---------------- Vertical: Google products ----------------
  googleEngine('youtube', 'YouTube', 'yt', 'video'),
  googleEngine('google-images', 'Google Images', 'i', 'vertical'),
  googleEngine('google-news', 'Google News', 'n', 'vertical'),
  googleEngine('google-shopping', 'Google Shopping', 'sh', 'shopping'),
  {
    id: 'google-scholar', name: 'Google Scholar', category: 'vertical', backend: 'Google',
    http: { url: (q, o) => `https://scholar.google.com/scholar_complete?hl=${enc(lang(o))}&q=${enc(q)}`, parse: (d) => asStrings(d?.l) },
  },

  // ---------------- Shopping ----------------
  {
    id: 'amazon', name: 'Amazon', category: 'shopping', backend: 'Amazon',
    http: {
      url: (q, o) => {
        const [host, mid] = amazonMarket(o);
        return `https://completion.${host}/api/2017/suggestions?mid=${mid}&alias=aps&prefix=${enc(q)}`;
      },
      parse: (d) => asStrings((d?.suggestions || []).map((x) => x.value)),
    },
  },
  {
    id: 'ebay', name: 'eBay', category: 'shopping', backend: 'eBay',
    // JSONP is served as application/json (blocked by Chrome), but CORS * works; body is JS-wrapped.
    cors: {
      url: (q, o) => `https://autosug.ebaystatic.com/autosug?_jgr=1&sId=${EBAY_SITES[country(o)] ?? 0}&kwd=${enc(q)}`,
      parse: (d) => asStrings(d?.res?.sug),
    },
    http: {
      url: (q, o) => `https://autosug.ebaystatic.com/autosug?_jgr=1&sId=${EBAY_SITES[country(o)] ?? 0}&kwd=${enc(q)}`,
      parse: (d) => asStrings(d?.res?.sug),
    },
  },
  {
    id: 'walmart', name: 'Walmart', category: 'shopping', backend: 'Walmart', region: 'US',
    http: {
      url: (q) => `https://www.walmart.com/typeahead/v3/complete?term=${enc(q)}`,
      parse: (d) => asStrings((d?.queries || []).map((x) => x.displayName)),
    },
  },

  // ---------------- Knowledge / social ----------------
  {
    id: 'wikipedia', name: 'Wikipedia', category: 'knowledge', backend: 'Wikimedia',
    cors: {
      url: (q, o) => `https://${enc(lang(o))}.wikipedia.org/w/api.php?action=opensearch&format=json&formatversion=2&limit=10&origin=*&search=${enc(q)}`,
      parse: openSearch,
    },
    http: {
      url: (q, o) => `https://${enc(lang(o))}.wikipedia.org/w/api.php?action=opensearch&format=json&formatversion=2&limit=10&search=${enc(q)}`,
      parse: openSearch,
    },
  },
  {
    id: 'tiktok', name: 'TikTok', category: 'video', backend: 'TikTok', experimental: true,
    http: {
      url: (q) => `https://www.tiktok.com/api/search/general/sug/?aid=1988&keyword=${enc(q)}`,
      parse: (d) => asStrings((d?.sug_list || []).map((x) => x.content)),
    },
  },
];

export const ENGINE_MAP = Object.fromEntries(ENGINES.map((e) => [e.id, e]));

/** Engines that work in a plain browser with no proxy. */
export const browserNative = (e) => Boolean(e.jsonp || e.cors);

/** Default selection for first-time users (fast, broad, browser-native). */
export const DEFAULT_ENGINES = ['google', 'bing', 'yahoo', 'duckduckgo', 'youtube', 'google-shopping', 'ebay', 'wikipedia'];

export const CATEGORIES = ['web', 'video', 'shopping', 'vertical', 'knowledge'];
