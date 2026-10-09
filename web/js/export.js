/** Serialisers for TXT / CSV / TSV / JSON exports. Pure functions, shared by web + CLI. */
import { wordCount, isQuestion } from './normalize.js';

export const FORMATS = ['txt', 'csv', 'tsv', 'json', 'md'];

export const MIME = {
  txt: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  json: 'application/json;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
};

const COLUMNS = ['keyword', 'engines', 'engine_count', 'hits', 'words', 'question', 'seed', 'source_query', 'strategy', 'depth'];

const row = (r) => [
  r.keyword,
  (r.engines || []).join('|'),
  (r.engines || []).length,
  r.hits ?? 1,
  wordCount(r.keyword),
  isQuestion(r.keyword) ? 'yes' : 'no',
  r.seed ?? '',
  r.query ?? '',
  r.strategy ?? '',
  r.depth ?? 0,
];

const csvCell = (v) => {
  const s = String(v ?? '');
  // Guard against CSV/formula injection in spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const tsvCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');

export function toTXT(records) { return records.map((r) => r.keyword).join('\n') + (records.length ? '\n' : ''); }

export function toCSV(records) {
  // BOM so Excel opens UTF-8 (Turkish, Chinese, Cyrillic…) correctly.
  return '\uFEFF' + [COLUMNS.join(','), ...records.map((r) => row(r).map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export function toTSV(records) {
  return [COLUMNS.join('\t'), ...records.map((r) => row(r).map(tsvCell).join('\t'))].join('\n') + '\n';
}

export function toJSON(records, meta = {}) {
  return JSON.stringify({
    tool: 'Advanced Free Keyword Research Tool',
    generatedAt: new Date().toISOString(),
    ...meta,
    count: records.length,
    keywords: records.map((r) => ({
      keyword: r.keyword, engines: r.engines, hits: r.hits, words: wordCount(r.keyword),
      question: isQuestion(r.keyword), seed: r.seed, sourceQuery: r.query, strategy: r.strategy, depth: r.depth,
    })),
  }, null, 2);
}

export function toMarkdown(records) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  return ['| # | Keyword | Engines | Hits |', '|---|---|---|---|',
    ...records.map((r, i) => `| ${i + 1} | ${esc(r.keyword)} | ${esc((r.engines || []).join(', '))} | ${r.hits ?? 1} |`)].join('\n') + '\n';
}

export function serialize(format, records, meta) {
  switch (format) {
    case 'txt': return toTXT(records);
    case 'csv': return toCSV(records);
    case 'tsv': return toTSV(records);
    case 'json': return toJSON(records, meta);
    case 'md': return toMarkdown(records);
    default: throw new Error(`Unknown format: ${format}`);
  }
}

export function fileName(seeds, format) {
  const base = (seeds?.[0] || 'keywords').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'keywords';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${base}${seeds?.length > 1 ? `-and-${seeds.length - 1}-more` : ''}-${stamp}.${format}`;
}
