import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_MAP, ENGINES, isEngineId, isValidLang, isValidCountry, localeSupport, localeTarget, yahooBase, DEFAULT_LOCALE } from '../web/js/engines.js';
import { expandSeed, alphabetKey } from '../web/js/expand.js';

const url = (id, o, t = 'http') => new URL(ENGINE_MAP[id][t].url('kahve', o));

test('default locale is Turkey', () => {
  assert.deepEqual(DEFAULT_LOCALE, { hl: 'tr', gl: 'tr' });
});

test('locale reaches every locale-aware engine', () => {
  const tr = { hl: 'tr', gl: 'tr' };
  assert.equal(url('google', tr).searchParams.get('hl'), 'tr');
  assert.equal(url('google', tr).searchParams.get('gl'), 'tr');
  assert.equal(url('youtube', tr, 'jsonp').searchParams.get('gl'), 'tr');
  assert.equal(url('bing', tr).searchParams.get('mkt'), 'tr-TR');
  assert.equal(url('duckduckgo', tr).searchParams.get('kl'), 'tr-tr');
  assert.equal(url('duckduckgo', { hl: 'en', gl: 'gb' }).searchParams.get('kl'), 'uk-en');
  assert.equal(url('yandex', tr).searchParams.get('uil'), 'tr');
  assert.equal(url('yandex', tr).searchParams.get('lr'), '983');
  assert.equal(url('ecosia', tr).searchParams.get('mkt'), 'tr-tr');
  assert.equal(url('qwant', tr).searchParams.get('locale'), 'tr_TR');
  assert.equal(url('swisscows', tr).searchParams.get('locale'), 'tr-TR');
  assert.equal(url('brave', tr).searchParams.get('country'), 'tr');
  assert.equal(url('tiktok', tr).searchParams.get('region'), 'TR');
  assert.equal(url('google-scholar', tr).searchParams.get('hl'), 'tr');
  assert.equal(url('wikipedia', tr).host, 'tr.wikipedia.org');
  assert.equal(url('wikipedia', { hl: 'pt-br', gl: 'br' }).host, 'pt.wikipedia.org');
  assert.equal(url('amazon', tr).host, 'completion.amazon.com.tr');
  assert.equal(url('amazon', tr).searchParams.get('mid'), 'A33AVAJ2PDY3EV');
  assert.equal(url('amazon', { hl: 'de', gl: 'de' }).host, 'completion.amazon.de');
  assert.equal(url('ebay', { hl: 'de', gl: 'de' }).searchParams.get('sId'), '77');
  assert.equal(url('bing', { hl: 'zh-cn', gl: 'cn' }).searchParams.get('mkt'), 'zh-CN');
});

test('Yahoo regional hosts with US fallback (tr endpoint is empty)', () => {
  assert.equal(yahooBase({ gl: 'de' }), 'https://de.search.yahoo.com/sugg/gossip/gossip-de-ura/');
  assert.equal(yahooBase({ gl: 'gb' }), 'https://uk.search.yahoo.com/sugg/gossip/gossip-uk-ura/');
  assert.equal(yahooBase({ gl: 'tr' }), 'https://search.yahoo.com/sugg/gossip/gossip-us-ura/');
});

test('unknown countries fall back safely, prototype keys never resolve', () => {
  assert.equal(url('amazon', { hl: 'en', gl: 'zz' }).host, 'completion.amazon.com');
  assert.equal(url('ebay', { hl: 'en', gl: 'zz' }).searchParams.get('sId'), '0');
  assert.equal(isEngineId('constructor'), false);
  assert.equal(isEngineId('__proto__'), false);
  assert.equal(isEngineId('google'), true);
});

test('every engine declares locale support; targets are described', () => {
  for (const e of ENGINES) assert.ok(['hl+gl', 'hl', 'gl', 'fixed'].includes(localeSupport(e)), e.id);
  assert.equal(localeTarget(ENGINE_MAP.amazon, { gl: 'tr' }), 'amazon.com.tr');
});

test('locale code validation', () => {
  for (const ok of ['tr', 'en', 'pt-br', 'zh-cn', 'fil']) assert.ok(isValidLang(ok), ok);
  for (const bad of ['', 'turkish', 'tr;drop', '../x', 'constructor']) assert.ok(!isValidLang(bad), bad);
  assert.ok(isValidCountry('tr'));
  for (const bad of ['tur', 't', '1a', '']) assert.ok(!isValidCountry(bad), bad);
});

test('expansion alphabet follows search language', () => {
  assert.equal(alphabetKey('tr'), 'tr');
  assert.equal(alphabetKey('pt-br'), 'pt');
  assert.equal(alphabetKey('xx'), 'en');
  assert.equal(alphabetKey('constructor'), 'en');
  assert.ok(expandSeed('kahve', { lang: 'az', seed: false }).some((x) => x.q === 'kahve ə'));
});
