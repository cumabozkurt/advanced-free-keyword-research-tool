import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseGoogleSerp, detectBlock } from '../lib/serp-parse.js';
import { buildSerpUrl, createHtmlSerpBackend, createBrowserSerpBackend, serpAvailability } from '../lib/google-serp.js';
import { createSerpService } from '../lib/serp-service.js';
import { runSerpPhase, clampPages, SerpBlockedError } from '../web/js/serp-client.js';
import { Miner } from '../web/js/miner.js';
import { sourceName } from '../web/js/engines.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fx = (name) => readFileSync(new URL(`./fixtures/serp/${name}.html`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- parser
test('serp parser: related searches, PAA, organic titles, next page (Turkish page)', () => {
  const r = parseGoogleSerp(fx('results-tr-page1'), { query: 'kahve makinesi', page: 0 });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.related, ['Kahve makinesi fiyatları', 'filtre kahve makinesi', 'türk kahvesi makinesi', 'philips kahve makinesi', 'espresso makinesi']);
  // tabs (udm/tbm), spelling (spell=1), tools (tbs), pagination (start) and the seed itself are excluded
  assert.ok(!r.related.some((x) => /kahve makinesi$/i.test(x) && x.toLowerCase() === 'kahve makinesi'));
  assert.ok(!r.related.includes('kahve fincanı'));
  assert.deepEqual(r.paa, ['Hangi kahve makinesi daha iyi?', 'Filtre kahve makinesi mi espresso makinesi mi?', 'Kahve makinesi kaç watt olmalı?']);
  assert.ok(r.organic.includes('En İyi Kahve Makinesi Hangisi? 2026 Rehberi & Karşılaştırma'));
  assert.ok(r.organic.includes("Türk Kahvesi Makinesi – Example's Market"));
  assert.equal(r.hasNext, true);
});

test('serp parser: last page has no next link; "People also search for" chips', () => {
  const r = parseGoogleSerp(fx('results-en-last'), { query: 'keyword research tool', page: 3 });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.related, ['free keyword research tool', 'keyword research tool google']);
  assert.equal(r.hasNext, false); // only a link back to start=20
});

test('serp parser: CAPTCHA, JavaScript wall and consent pages are detected (real captured CAPTCHA)', () => {
  assert.equal(parseGoogleSerp(fx('captcha-tr')).status, 'captcha');
  assert.equal(parseGoogleSerp(fx('jswall')).status, 'jswall');
  assert.equal(parseGoogleSerp(fx('consent')).status, 'consent');
  assert.equal(detectBlock('<html></html>', 'https://www.google.com/sorry/index?continue=x'), 'captcha');
  assert.equal(parseGoogleSerp('<html><body>nothing</body></html>').status, 'empty');
});

test('buildSerpUrl wires hl / gl / lr and start=page*10', () => {
  const u = new URL(buildSerpUrl('kahve makinesi', { hl: 'tr', gl: 'tr', page: 0 }));
  assert.equal(u.origin + u.pathname, 'https://www.google.com/search');
  assert.equal(u.searchParams.get('q'), 'kahve makinesi');
  assert.equal(u.searchParams.get('hl'), 'tr');
  assert.equal(u.searchParams.get('gl'), 'tr');
  assert.equal(u.searchParams.get('lr'), 'lang_tr');
  assert.equal(u.searchParams.get('start'), null);
  const u3 = new URL(buildSerpUrl('x', { hl: 'pt-br', gl: 'br', page: 3 }));
  assert.equal(u3.searchParams.get('start'), '30');
  assert.equal(u3.searchParams.get('lr'), 'lang_pt-BR');
  assert.throws(() => buildSerpUrl('x', { hl: 'tr;x', gl: 'tr' }));
  assert.equal(clampPages(500), 100);
  assert.equal(clampPages(0), 1);
  assert.equal(sourceName('serp-paa'), 'Google SERP · PAA');
});

// ---------------------------------------------------------------- orchestration
const page = (n, { next = true, related = [], paa = [] } = {}) => ({ status: 'ok', related, paa, organic: [`Title ${n}`], hasNext: next });

test('runSerpPhase walks pages until Google has no next page and tags sources', async () => {
  const calls = [];
  const fetchPage = async (q, p) => {
    calls.push(`${q}#${p}`);
    return page(p, { next: p < 2, related: [`${q} related ${p}`], paa: [`${q} soru ${p}?`] });
  };
  const miner = new Miner({ engines: [], seeds: ['kahve'], fetcher: async () => [] });
  const summary = await runSerpPhase({ miner, seeds: ['kahve', 'çay'], fetchPage, pages: 10, sources: ['related', 'paa', 'organic'], delayMs: 0, minDelayMs: 0 });
  assert.deepEqual(calls, ['kahve#0', 'kahve#1', 'kahve#2', 'çay#0', 'çay#1', 'çay#2']);
  assert.equal(summary.pages, 6);
  const res = miner.getResults();
  assert.deepEqual(res.find((r) => r.keyword === 'kahve related 1').engines, ['serp-related']);
  assert.deepEqual(res.find((r) => r.keyword === 'çay soru 2?').engines, ['serp-paa']);
  assert.deepEqual(res.find((r) => r.keyword === 'Title 0').engines, ['serp-organic']); // dedupe across seeds
  assert.equal(res.find((r) => r.keyword === 'kahve related 2').strategy, 'serp-page-3');
  assert.equal(miner.stats.perEngine['google-serp'].ok, 6);
});

test('runSerpPhase respects the page cap and the delay between pages', async () => {
  let n = 0;
  const t0 = Date.now();
  const miner = new Miner({ engines: [], seeds: ['x'], fetcher: async () => [] });
  await runSerpPhase({ miner, seeds: ['x'], fetchPage: async (q, p) => { n += 1; return page(p); }, pages: 3, delayMs: 60, minDelayMs: 0 });
  assert.equal(n, 3);
  assert.ok(Date.now() - t0 >= 110, 'two delays between three pages');
  // the public minimum delay is enforced when callers do not lower it
  const m2 = new Miner({ engines: [], seeds: ['x'], fetcher: async () => [] });
  const t1 = Date.now();
  const p2 = runSerpPhase({ miner: m2, seeds: ['x'], fetchPage: async (q, p) => page(p), pages: 2, delayMs: 0 });
  setTimeout(() => m2.stop(), 300);
  const s2 = await p2;
  assert.equal(s2.pages, 1, 'second page must wait ≥2 s, stop() interrupts the wait');
  assert.ok(Date.now() - t1 < 1500);
});

test('CAPTCHA stops SERP for good while autocomplete keeps working', async () => {
  const serpCalls = [];
  const miner = new Miner({
    engines: ['google'], seeds: ['kahve'], delayMs: 0, expansion: { seed: true, alphaSuffix: true, lang: 'tr' },
    fetcher: async (id, q) => [`${q} öneri`],
    alongside: [(m) => runSerpPhase({
      miner: m, seeds: ['kahve', 'çay'], delayMs: 0, minDelayMs: 0, pages: 10,
      fetchPage: async (q, p) => { serpCalls.push(p); if (p === 1) return { status: 'captcha', related: [], paa: [], organic: [], hasNext: false }; return page(p, { related: ['kahve fiyat'] }); },
    })],
  });
  const results = await miner.run();
  assert.deepEqual(serpCalls, [0, 1], 'no further pages / seeds after CAPTCHA');
  assert.equal(miner.stats.perEngine['google-serp'].disabled, true);
  assert.equal(miner.stats.perEngine['google-serp'].lastError, 'captcha');
  assert.ok(results.some((r) => r.keyword === 'kahve fiyat'));
  assert.ok(results.filter((r) => r.engines.includes('google')).length > 20, 'autocomplete results still collected');
  // thrown SerpBlockedError (e.g. puppeteer missing) is handled the same way
  const m2 = new Miner({ engines: [], seeds: ['x'], fetcher: async () => [] });
  const s = await runSerpPhase({ miner: m2, seeds: ['x'], delayMs: 0, minDelayMs: 0, fetchPage: async () => { throw new SerpBlockedError('unavailable', 'no chrome'); } });
  assert.equal(s.blocked, 'unavailable');
});

// ---------------------------------------------------------------- server-side service
test('serp service: validation, cache, serialised gap, cool-down after CAPTCHA', async () => {
  let clock = 1_000_000;
  const slept = [];
  const loads = [];
  let captcha = false;
  const backend = { fetchPage: async (q, p) => { loads.push(`${q}#${p}`); return captcha ? { status: 'captcha' } : page(p); } };
  const svc = createSerpService({ backend, options: { minGapMs: 4000, cooldownMs: 60000 }, now: () => clock, sleep: async (ms) => { slept.push(ms); clock += ms; } });
  const P = (o) => new URLSearchParams(o);
  assert.equal((await svc.handle(P({ q: '' }))).status, 400);
  assert.equal((await svc.handle(P({ q: 'x', page: '100' }))).status, 400);
  assert.equal((await svc.handle(P({ q: 'x', gl: 'turkey' }))).status, 400);
  const a = await svc.handle(P({ q: 'kahve', page: '0' }));
  assert.equal(a.body.status, 'ok');
  const b = await svc.handle(P({ q: 'kahve', page: '0' }));
  assert.equal(b.body.cached, true);
  await svc.handle(P({ q: 'kahve', page: '1' }));
  assert.deepEqual(slept, [4000], 'minimum gap between Google page loads');
  captcha = true;
  assert.equal((await svc.handle(P({ q: 'kahve', page: '2' }))).body.status, 'captcha');
  captcha = false;
  const c = await svc.handle(P({ q: 'kahve', page: '3' }));
  assert.equal(c.body.status, 'captcha');
  assert.ok(c.body.cooldownUntil > clock);
  assert.equal(loads.length, 3, 'no Google request during cool-down');
  clock += 61000;
  assert.equal((await svc.handle(P({ q: 'kahve', page: '3' }))).body.status, 'ok');
});

// ---------------------------------------------------------------- end-to-end against a fake Google
function fakeGoogle({ captchaAt = -1 } = {}) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const start = Number(u.searchParams.get('start') || 0);
    const p = start / 10;
    hits.push({ q: u.searchParams.get('q'), p, hl: u.searchParams.get('hl'), gl: u.searchParams.get('gl'), lr: u.searchParams.get('lr') });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (p === captchaAt) { res.statusCode = 429; return res.end(fx('captcha-tr')); }
    const q = u.searchParams.get('q');
    const next = p < 2 ? `<a id="pnnext" href="/search?q=${encodeURIComponent(q)}&amp;start=${start + 10}">Sonraki</a>` : '';
    res.end(`<html><body><div id="search"><h3>${q} başlık ${p}</h3><div data-q="${q} nedir ${p}?"></div></div>
      <a href="/search?q=${encodeURIComponent(`${q} ilgili ${p}`)}&amp;sa=X"><div>${q} ilgili ${p}</div></a>${next}</body></html>`);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, hits, base: `http://127.0.0.1:${srv.address().port}` })));
}

const run = (args) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['bin/cli.js', ...args], { cwd: root });
  let out = ''; let err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (code) => resolve({ code, out, err }));
});

test('CLI --serp-only (html backend) walks pages of a fake Google and exports tagged sources', async (t) => {
  const g = await fakeGoogle();
  t.after(() => g.srv.close());
  const r = await run(['kahve', '--serp-only', '--serp-pages', '5', '--serp-sources', 'related,paa,organic', '--serp-backend', 'html', '--serp-base-url', g.base, '--serp-delay', '0', '-l', 'tr', '-c', 'tr', '--format', 'json']);
  assert.equal(r.code, 0, r.err);
  const json = JSON.parse(r.out);
  const kws = json.keywords.map((x) => x.keyword);
  assert.deepEqual(g.hits.map((h) => h.p), [0, 1, 2], 'stops when there is no next page');
  assert.deepEqual([g.hits[0].hl, g.hits[0].gl, g.hits[0].lr], ['tr', 'tr', 'lang_tr']);
  for (const k of ['kahve ilgili 0', 'kahve nedir 2?', 'kahve başlık 1']) assert.ok(kws.includes(k), k);
  assert.ok(json.keywords.find((x) => x.keyword === 'kahve ilgili 1').engines.includes('serp-related'));
  assert.match(r.err, /no more result pages after page 3/);
});

test('CLI --serp stops on CAPTCHA and reports it', async (t) => {
  const g = await fakeGoogle({ captchaAt: 1 });
  t.after(() => g.srv.close());
  const r = await run(['kahve', '--serp-only', '--serp-backend', 'html', '--serp-base-url', g.base, '--serp-delay', '0', '--format', 'txt']);
  assert.equal(r.code, 0, r.err);
  assert.equal(g.hits.length, 2);
  assert.match(r.err, /Google SERP stopped on page 2 .*captcha/);
  assert.match(r.out, /kahve ilgili 0/);
  assert.match((await run(['x', '--serp-pages', '101'])).err, /--serp-pages must be an integer between 1 and 100/);
  assert.match((await run(['x', '--serp', '--serp-delay', '100'])).err, /--serp-delay must be/);
  assert.match((await run(['x', '--serp', '--serp-sources', 'ads'])).err, /Unknown --serp-sources/);
});

test('server /api/serp: loopback-only, origin-checked, parsed fields only', async (t) => {
  const g = await fakeGoogle();
  const port = 20000 + Math.floor(Math.random() * 2000);
  const srv = spawn(process.execPath, ['server/server.js', '--port', String(port), '--serp-backend', 'html', '--serp-base-url', g.base, '--serp-gap', '0'], { cwd: root });
  t.after(() => { srv.kill(); g.srv.close(); });
  await new Promise((res, rej) => {
    srv.stdout.on('data', (d) => { if (String(d).includes('SERP pages')) res(); });
    srv.on('exit', rej);
    setTimeout(() => rej(new Error('server did not start')), 5000);
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.serp.available, true);
  const r = await fetch(`${base}/api/serp?q=kahve&page=1&hl=tr&gl=tr`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.related, ['kahve ilgili 1']);
  assert.equal(body.hasNext, true);
  assert.ok(!('html' in body));
  assert.equal((await fetch(`${base}/api/serp?q=kahve`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/serp?q=kahve`, { headers: { Origin: 'https://cumabozkurt.github.io' } })).status, 200);
  assert.equal((await fetch(`${base}/api/serp?q=kahve&page=-1`)).status, 400);
});

test('browser backend (real Chrome via puppeteer-core) against a fake Google', async (t) => {
  const avail = await serpAvailability();
  if (!avail.available) { t.skip(`browser backend unavailable: ${avail.reason}`); return; }
  const g = await fakeGoogle({ captchaAt: 2 });
  const be = createBrowserSerpBackend({ baseUrl: g.base });
  t.after(async () => { await be.close(); g.srv.close(); });
  const p0 = await be.fetchPage('kahve', 0, { hl: 'tr', gl: 'tr' });
  assert.equal(p0.status, 'ok');
  assert.deepEqual(p0.paa, ['kahve nedir 0?']);
  const p2 = await be.fetchPage('kahve', 2, { hl: 'tr', gl: 'tr' });
  assert.equal(p2.status, 'captcha');
  // the html backend reports the same thing for the same page
  const h = await createHtmlSerpBackend({ baseUrl: g.base }).fetchPage('kahve', 2, { hl: 'tr', gl: 'tr' });
  assert.equal(h.status, 'captcha');
});
