#!/usr/bin/env node
/**
 * Live health check of every engine endpoint (Node / http transport).
 *   npm run check            -> table
 *   npm run check -- --json  -> JSON (used by the weekly GitHub Action)
 */
import { ENGINES } from '../web/js/engines.js';
import { createHttpFetcher } from '../lib/http-fetcher.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const ua = args.find((a) => a.startsWith('--ua='))?.slice(5);
const fetcher = createHttpFetcher(ua ? { userAgent: ua } : {});
const probes = { baidu: '手机', so360: '手机', sogou: '手机', quark: '手机', naver: '코딩', seznam: 'auto', default: 'seo tools' };

const rows = [];
for (const e of ENGINES) {
  const q = probes[e.id] || probes.default;
  const t0 = Date.now();
  let ok = false; let n = 0; let sample = ''; let error = '';
  try {
    const s = await fetcher(e.id, q, { hl: 'en', gl: 'us', timeoutMs: 12000 });
    n = s.length; ok = n > 0; sample = s.slice(0, 3).join(' | ');
    if (!ok) error = 'empty';
  } catch (err) { error = String(err.message || err); }
  rows.push({ id: e.id, name: e.name, browser: e.jsonp ? 'jsonp' : e.cors ? 'cors' : 'proxy', ok, count: n, ms: Date.now() - t0, sample, error });
  await new Promise((r) => setTimeout(r, 250));
}

if (asJson) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2));
} else {
  for (const r of rows) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.id.padEnd(16)} ${r.browser.padEnd(6)} ${String(r.count).padStart(3)}  ${String(r.ms).padStart(5)}ms  ${r.ok ? r.sample : r.error}`);
  }
  const bad = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - bad}/${rows.length} engines OK`);
}
process.exitCode = rows.some((r) => !r.ok && ['google', 'bing', 'duckduckgo'].includes(r.id)) ? 1 : 0;
