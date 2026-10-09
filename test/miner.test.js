import test from 'node:test';
import assert from 'node:assert/strict';
import { Miner } from '../web/js/miner.js';

// Fake fetcher: each engine returns query + " x" / query + " y"
const fake = (calls) => async (engine, q) => { calls.push(`${engine}:${q}`); return engine === 'b' ? [`${q} x`] : [`${q} x`, `${q} y`]; };

test('dedupes across engines and tracks engine sets', async () => {
  const calls = [];
  const m = new Miner({ fetcher: fake(calls), engines: ['a', 'b'], seeds: ['seo'], expansion: { alphaSuffix: false }, delayMs: 0 });
  const res = await m.run();
  const x = res.find((r) => r.keyword === 'seo x');
  assert.deepEqual(x.engines.sort(), ['a', 'b']);
  assert.equal(x.hits, 2);
  assert.equal(res.length, 2);
  assert.equal(calls.length, 2);
});

test('recursion respects depth and maxQueries', async () => {
  const calls = [];
  const m = new Miner({ fetcher: fake(calls), engines: ['a'], seeds: ['k'], expansion: { alphaSuffix: false }, depth: 2, delayMs: 0, maxQueries: 5 });
  const res = await m.run();
  assert.ok(calls.length <= 5);
  assert.ok(res.some((r) => r.depth === 1));
  assert.ok(res.every((r) => r.depth <= 2));
});

test('disables an engine after consecutive errors, others continue', async () => {
  const fetcher = async (engine, q) => { if (engine === 'bad') throw new Error('boom'); return [`${q} ok`]; };
  const m = new Miner({ fetcher, engines: ['bad', 'good'], seeds: ['a', 'b', 'c', 'd'], expansion: { alphaSuffix: false }, delayMs: 0, retries: 0, maxConsecutiveErrors: 2 });
  const disabled = [];
  m.on('engineDisabled', (e) => disabled.push(e.engine));
  const res = await m.run();
  assert.deepEqual(disabled, ['bad']);
  assert.equal(res.length, 4);
});

test('stop() aborts quickly and keeps partial results', async () => {
  const fetcher = async (engine, q) => { await new Promise((r) => setTimeout(r, 20)); return [`${q} r`]; };
  const m = new Miner({ fetcher, engines: ['a'], seeds: ['s'], expansion: { alphaSuffix: true, lang: 'en' }, delayMs: 10 });
  setTimeout(() => m.stop(), 120);
  const t0 = Date.now();
  const res = await m.run();
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(m.state, 'stopped');
  assert.ok(res.length > 0 && res.length < 27);
});

test('mustContainSeed filters off-topic suggestions', async () => {
  const fetcher = async () => ['seo tools', 'cooking tips'];
  const m = new Miner({ fetcher, engines: ['a'], seeds: ['seo'], expansion: { alphaSuffix: false }, delayMs: 0, mustContainSeed: true });
  const res = await m.run();
  assert.deepEqual(res.map((r) => r.keyword), ['seo tools']);
});
