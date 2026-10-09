/** Normalisation used for de-duplication across engines. */
export function normalizeKeyword(s) {
  return String(s || '')
    .normalize('NFC')
    .toLocaleLowerCase()
    // "İ".toLocaleLowerCase() outside a Turkish locale gives "i" + U+0307; fold it so İstanbul == istanbul
    .replace(/i\u0307/g, 'i')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// English/German/French/Spanish/Russian: question word at the start. Turkish: question words/particles anywhere
// ("kahve nasıl yapılır", "seo nedir", "iphone su geçirir mi").
const QUESTION_START_RE = /^(how|what|why|when|where|who|which|is|are|does|do|will|should|wie|was|warum|wann|wo|comment|pourquoi|quand|où|cómo|qué|por qué|cuándo|dónde|как|что|почему|когда|где)(?=\s|$)|\?$/iu;
const QUESTION_TR_RE = /(^|\s)(nasıl|nedir|neden|niçin|niye|hangi|hangisi|kim|kimdir|kaç|nerede|nereye|nereden|ne zaman|ne kadar|ne demek|mı|mi|mu|mü|mıdır|midir|mudur|müdür)(?=\s|$)/iu;
const QUESTION_RE = { test: (s) => QUESTION_START_RE.test(s) || QUESTION_TR_RE.test(s) };
export const isQuestion = (s) => QUESTION_RE.test(String(s).trim());

export const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
