/** Normalisation used for de-duplication across engines. */
export function normalizeKeyword(s) {
  return String(s || '')
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUESTION_RE = /^(how|what|why|when|where|who|which|can|is|are|does|do|will|should|nasıl|nedir|neden|niçin|ne|hangi|kim|kaç|nerede|wie|was|warum|comment|pourquoi|cómo|qué|как|что|почему)(?=\s|$)|\?$|(^|\s)(mı|mi|mu|mü|mıdır|midir|nedir|nasıl|nerede|ne zaman)$/iu;
export const isQuestion = (s) => QUESTION_RE.test(String(s).trim());

export const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
