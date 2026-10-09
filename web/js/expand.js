/**
 * Query expansion strategies (long-tail generation).
 * Inspired by keywordshitter2's prefix/suffix lists, but locale-aware and configurable.
 */

export const ALPHABETS = {
  en: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  tr: 'abcçdefgğhıijklmnoöprsştuüvyz'.split(''),
  de: 'abcdefghijklmnopqrstuvwxyzäöüß'.split(''),
  fr: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  es: 'abcdefghijklmnñopqrstuvwxyz'.split(''),
  pt: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  it: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  ru: 'абвгдеёжзийклмнопрстуфхцчшщэюя'.split(''),
};

export const DIGITS = '0123456789'.split('');

export const QUESTIONS = {
  en: ['how', 'what', 'why', 'when', 'where', 'who', 'which', 'can', 'is', 'are', 'does', 'will', 'should'],
  tr: ['nasıl', 'nedir', 'neden', 'ne zaman', 'nerede', 'kim', 'hangi', 'kaç', 'mı', 'ne kadar', 'nasıl yapılır'],
  de: ['wie', 'was', 'warum', 'wann', 'wo', 'wer', 'welche', 'kann'],
  fr: ['comment', 'quoi', 'pourquoi', 'quand', 'où', 'qui', 'quel'],
  es: ['cómo', 'qué', 'por qué', 'cuándo', 'dónde', 'quién', 'cuál'],
  ru: ['как', 'что', 'почему', 'когда', 'где', 'кто', 'какой'],
};

/** Words that go AFTER the seed (modifiers / prepositions / comparisons). */
export const MODIFIERS = {
  en: ['for', 'with', 'without', 'to', 'near', 'near me', 'vs', 'versus', 'like', 'free', 'best', 'cheap', 'online', 'review', 'alternative', 'price', '2026'],
  tr: ['için', 'ile', 'olmadan', 'gibi', 'vs', 'yakınımda', 'ücretsiz', 'en iyi', 'ucuz', 'online', 'fiyat', 'fiyatları', 'yorum', 'alternatif', 'nedir', 'nasıl', '2026'],
  de: ['für', 'mit', 'ohne', 'in der nähe', 'vs', 'kostenlos', 'beste', 'günstig', 'online', 'test', 'preis'],
  fr: ['pour', 'avec', 'sans', 'près de moi', 'vs', 'gratuit', 'meilleur', 'pas cher', 'en ligne', 'avis', 'prix'],
  es: ['para', 'con', 'sin', 'cerca de mí', 'vs', 'gratis', 'mejor', 'barato', 'online', 'opiniones', 'precio'],
  ru: ['для', 'с', 'без', 'рядом', 'vs', 'бесплатно', 'лучший', 'дешево', 'онлайн', 'отзывы', 'цена'],
};

export const STRATEGIES = ['seed', 'alphaSuffix', 'alphaPrefix', 'digitSuffix', 'questions', 'modifiers', 'custom'];

export const DEFAULT_EXPANSION = {
  seed: true,
  alphaSuffix: true,
  alphaPrefix: false,
  digitSuffix: false,
  questions: false,
  modifiers: false,
  custom: false,
  customPrefixes: [],
  customSuffixes: [],
  lang: 'en',
};

const pick = (table, l) => table[l] || table[(l || '').split('-')[0]] || table.en;

/**
 * Build the list of queries for one seed.
 * @returns {{q:string, strategy:string}[]}
 */
export function expandSeed(seed, opts = {}) {
  const o = { ...DEFAULT_EXPANSION, ...opts };
  const s = String(seed).trim().replace(/\s+/g, ' ');
  if (!s) return [];
  const out = [];
  const seen = new Set();
  const add = (q, strategy) => {
    const k = q.trim().replace(/\s+/g, ' ');
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ q: k, strategy });
  };
  if (o.seed) add(s, 'seed');
  if (o.alphaSuffix) for (const c of pick(ALPHABETS, o.lang)) add(`${s} ${c}`, 'alphaSuffix');
  if (o.alphaPrefix) for (const c of pick(ALPHABETS, o.lang)) add(`${c} ${s}`, 'alphaPrefix');
  if (o.digitSuffix) for (const d of DIGITS) add(`${s} ${d}`, 'digitSuffix');
  if (o.questions) for (const w of pick(QUESTIONS, o.lang)) add(`${w} ${s}`, 'questions');
  if (o.modifiers) for (const w of pick(MODIFIERS, o.lang)) add(`${s} ${w}`, 'modifiers');
  if (o.custom) {
    for (const p of o.customPrefixes || []) if (p.trim()) add(`${p.trim()} ${s}`, 'custom');
    for (const x of o.customSuffixes || []) if (x.trim()) add(`${s} ${x.trim()}`, 'custom');
  }
  return out;
}

/** Parse a bulk textarea / file into unique seeds (newline, comma or semicolon separated). */
export function parseSeeds(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || '').split(/[\n\r,;\t]+/)) {
    const s = raw.trim().replace(/\s+/g, ' ');
    const k = s.toLocaleLowerCase();
    if (s && !seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
}

/** Split comma/newline separated custom lists. */
export const parseList = (text) => String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
