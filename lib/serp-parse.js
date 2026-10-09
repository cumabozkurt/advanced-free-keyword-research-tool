/**
 * Pure (dependency-free) parser for Google search result pages.
 * Extracts only keyword-research fields — never returns raw HTML to users.
 *
 *   parseGoogleSerp(html, { query, page, finalUrl }) -> {
 *     status: 'ok' | 'captcha' | 'jswall' | 'consent' | 'empty',
 *     related: string[],   // "İlgili aramalar" / "Searches related to" / "People also search for" chips
 *     paa: string[],       // "Diğer kullanıcılar şunları da sordu" / "People also ask" questions
 *     organic: string[],   // organic result titles (<h3>)
 *     hasNext: boolean,
 *   }
 *
 * Google changes its markup often. The parser relies on stable-ish signals rather than class names:
 *   - related searches: <a href="/search?q=X…"> links whose visible text equals X (tabs/pagination excluded)
 *   - PAA: data-q="question" attributes
 *   - organic titles: <h3> elements
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#34': '"' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] ?? m));
}

export const stripTags = (s) => decodeEntities(String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const norm = (s) => String(s).normalize('NFC').toLocaleLowerCase().replace(/i\u0307/g, 'i').replace(/\s+/g, ' ').trim();

// Params that mark a link as a tab, pagination, tool, or spelling suggestion rather than a related search.
const NON_RELATED_PARAMS = ['tbm', 'udm', 'start', 'tbs', 'spell', 'nfpr', 'stick', 'ibp', 'lr', 'cr', 'as_sitesearch', 'si', 'csui'];

export function detectBlock(html, finalUrl = '') {
  const u = String(finalUrl);
  if (/\/sorry\//.test(u) || /id=["']?captcha-form|g-recaptcha|unusual traffic from your computer network|sıra dışı bir trafik algıladı|\/sorry\/index/i.test(html)) return 'captcha';
  if (/consent\.google\./i.test(u) || /action=["']https:\/\/consent\.google\./i.test(html)) return 'consent';
  if (/\/httpservice\/retry\/enablejs|[?&]enablejs|websearch\/answer\/16515119|update your browser|browser is no longer supported/i.test(html) && !/<h3[\s>]/i.test(html)) return 'jswall';
  return null;
}

function unique(list, exclude = new Set()) {
  const seen = new Set(exclude);
  const out = [];
  for (const x of list) {
    const k = norm(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function parseGoogleSerp(html, { query = '', page = 0, finalUrl = '' } = {}) {
  const src = String(html || '');
  const blocked = detectBlock(src, finalUrl);
  if (blocked) return { status: blocked, related: [], paa: [], organic: [], hasNext: false };

  const seed = new Set([norm(query)]);

  // ---- organic titles
  const organic = [];
  for (const m of src.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)) {
    const t = stripTags(m[1]);
    if (t.length >= 3 && t.length <= 200) organic.push(t);
  }

  // ---- People also ask
  const paa = [];
  for (const m of src.matchAll(/\bdata-q="([^"]{3,300})"/gi)) paa.push(decodeEntities(m[1]).replace(/\s+/g, ' ').trim());

  // ---- Related searches / people also search for
  const related = [];
  for (const m of src.matchAll(/<a\b[^>]*\bhref="(\/search\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let params;
    try { params = new URLSearchParams(decodeEntities(m[1]).slice('/search?'.length)); } catch { continue; }
    const q = (params.get('q') || '').trim();
    if (!q || NON_RELATED_PARAMS.some((p) => params.has(p))) continue;
    const text = stripTags(m[2]);
    if (!text || norm(text) !== norm(q)) continue; // visible text must equal the linked query
    related.push(q);
  }

  // ---- pagination
  const nextStart = (page + 1) * 10;
  const hasNext = /id=["']?pnnext/i.test(src) || new RegExp(`[?&;]start=${nextStart}(?:&|"|$)`).test(src);

  const result = {
    status: 'ok',
    related: unique(related, seed),
    paa: unique(paa),
    organic: unique(organic),
    hasNext,
  };
  if (!result.related.length && !result.paa.length && !result.organic.length) result.status = 'empty';
  return result;
}
