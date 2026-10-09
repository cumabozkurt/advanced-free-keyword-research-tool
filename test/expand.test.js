import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSeed, parseSeeds, ALPHABETS } from '../web/js/expand.js';

test('parseSeeds splits bulk input and de-duplicates', () => {
  assert.deepEqual(parseSeeds('seo tools\nSEO  tools, kahve;  çay \n\n'), ['seo tools', 'kahve', 'çay']);
});

test('expandSeed default = seed + a..z suffix', () => {
  const q = expandSeed('seo', { lang: 'en' });
  assert.equal(q[0].q, 'seo');
  assert.equal(q.length, 1 + 26);
  assert.ok(q.some((x) => x.q === 'seo z'));
});

test('Turkish alphabet is used for tr', () => {
  const q = expandSeed('kahve', { lang: 'tr', seed: false }).map((x) => x.q);
  assert.equal(q.length, ALPHABETS.tr.length);
  assert.ok(q.includes('kahve ş'));
});

test('questions, modifiers and custom lists', () => {
  const q = expandSeed('kahve', { lang: 'tr', seed: false, alphaSuffix: false, questions: true, modifiers: true, custom: true, customPrefixes: ['en ucuz'], customSuffixes: ['2026'] }).map((x) => x.q);
  assert.ok(q.includes('nasıl kahve'));
  assert.ok(q.includes('kahve fiyatları'));
  assert.ok(q.includes('en ucuz kahve'));
  assert.ok(q.includes('kahve 2026'));
  assert.equal(new Set(q).size, q.length);
});
