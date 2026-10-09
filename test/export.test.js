import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, fileName } from '../web/js/export.js';

const recs = [
  { keyword: 'seo tools free', engines: ['google', 'bing'], hits: 2, seed: 'seo tools', query: 'seo tools', strategy: 'seed', depth: 0 },
  { keyword: '=cmd "quoted", text', engines: ['bing'], hits: 1, seed: 'x', query: 'x', strategy: 'seed', depth: 0 },
  { keyword: 'nasıl seo yapılır', engines: ['yandex'], hits: 1, seed: 'seo', query: 'nasıl seo', strategy: 'questions', depth: 0 },
];

test('txt is one keyword per line', () => {
  assert.equal(serialize('txt', recs), 'seo tools free\n=cmd "quoted", text\nnasıl seo yapılır\n');
});

test('csv has BOM, header, escaping and formula-injection guard', () => {
  const csv = serialize('csv', recs);
  assert.ok(csv.startsWith('\uFEFFkeyword,engines'));
  assert.ok(csv.includes(`"'=cmd ""quoted"", text"`));
  assert.ok(csv.includes('seo tools free,google|bing,2,2,3,no'));
  assert.ok(csv.includes('nasıl seo yapılır,yandex,1,1,3,yes'));
});

test('tsv and json are valid', () => {
  const tsv = serialize('tsv', recs).trim().split('\n');
  assert.equal(tsv.length, 4);
  assert.equal(tsv[1].split('\t').length, 10);
  const json = JSON.parse(serialize('json', recs, { seeds: ['seo'] }));
  assert.equal(json.count, 3);
  assert.equal(json.keywords[0].engines.length, 2);
  assert.equal(json.tool, 'Advanced Free Keyword Research Tool');
});

test('file names are safe and unicode-aware', () => {
  assert.match(fileName(['Kahve Makinesi!', 'b'], 'csv'), /^kahve-makinesi-and-1-more-\d{4}-\d\d-\d\d-\d\d-\d\d\.csv$/);
});
