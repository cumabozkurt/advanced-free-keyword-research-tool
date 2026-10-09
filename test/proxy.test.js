import test from 'node:test';
import assert from 'node:assert/strict';
import { createProxy } from '../lib/proxy-core.js';

test('proxy only accepts allow-listed engines and caches', async () => {
  let n = 0;
  const proxy = createProxy({ fetcher: async (e, q) => { n++; return [`${q} 1`]; }, limits: { perEngineGapMs: 0 } });
  const bad = await proxy(new URLSearchParams('engine=http://evil&q=x'));
  assert.equal(bad.status, 400);
  const ok = await proxy(new URLSearchParams('engine=amazon&q=laptop'));
  assert.deepEqual(ok.body.suggestions, ['laptop 1']);
  const again = await proxy(new URLSearchParams('engine=amazon&q=laptop'));
  assert.equal(again.body.cached, true);
  assert.equal(n, 1);
  assert.equal((await proxy(new URLSearchParams('engine=amazon&q=x&gl=turkey'))).status, 400);
  const long = await proxy(new URLSearchParams(`engine=google&q=${'a'.repeat(300)}`));
  assert.equal(long.status, 400);
});

test('per-IP rate limit', async () => {
  const proxy = createProxy({ fetcher: async () => [], limits: { perIpPerMinute: 3, perEngineGapMs: 0 } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await proxy(new URLSearchParams(`engine=google&q=q${i}`), '1.2.3.4')).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('loopback clients of the local server are not throttled by the per-IP limit', async () => {
  const proxy = createProxy({ fetcher: async () => [], limits: { perIpPerMinute: 2, perEngineGapMs: 0, exemptLoopback: true } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await proxy(new URLSearchParams(`engine=google&q=l${i}`), '127.0.0.1')).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200]);
  assert.equal((await proxy(new URLSearchParams('engine=google&q=r1'), '10.0.0.9')).status, 200);
  assert.equal((await proxy(new URLSearchParams('engine=google&q=r2'), '10.0.0.9')).status, 200);
  assert.equal((await proxy(new URLSearchParams('engine=google&q=r3'), '10.0.0.9')).status, 429);
});
