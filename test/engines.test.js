import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES, ENGINE_MAP, DEFAULT_ENGINES, parseJsonish, cleanText } from '../web/js/engines.js';

test('every engine has id, name, http transport and unique id', () => {
  const ids = new Set();
  for (const e of ENGINES) {
    assert.ok(e.id && e.name && e.category, e.id);
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`); ids.add(e.id);
    assert.equal(typeof e.http.url, 'function');
    assert.equal(typeof e.http.parse, 'function');
    const url = new URL(e.http.url('seo tools', { hl: 'tr', gl: 'tr' }));
    assert.equal(url.protocol, 'https:');
  }
  for (const id of DEFAULT_ENGINES) assert.ok(ENGINE_MAP[id], id);
});

test('parseJsonish handles JSONP, comments and multi-arg calls', () => {
  assert.deepEqual(parseJsonish('cb(["a",["b"]])'), ['a', ['b']]);
  assert.deepEqual(parseJsonish('/**/x.y._do({"res":{"sug":["s"]}})'), { res: { sug: ['s'] } });
  assert.deepEqual(parseJsonish('window.sogou.sug(["q",["x","y"]],-1);'), ['q', ['x', 'y']]);
  assert.deepEqual(parseJsonish('[1,2]'), [1, 2]);
});

test('parsers extract suggestion strings from recorded responses', () => {
  const fx = {
    google: ['seo', ['seo tools', 'seo <b>free</b>'], [], {}],
    bing: ['seo', ['seo a', 'seo b']],
    yahoo: { q: 'seo', r: [{ k: 'seo y1', m: 0 }, { k: 'seo y2', m: 0 }] },
    duckduckgo: [{ phrase: 'seo d1' }, { phrase: 'seo d2' }],
    baidu: { q: 'seo', g: [{ q: 'seo b1' }] },
    naver: { items: [[['코딩 뜻', '0'], ['코딩 배우기', '0']]] },
    so360: { result: [{ word: '手机' }] },
    seznam: { result: [{ text: [{ text: 'auto ' }, { text: 'esa' }] }] },
    qwant: { data: { items: [{ value: 'seo q' }] } },
    amazon: { suggestions: [{ value: 'laptop stand' }] },
    ebay: { res: { sug: ['iphone 15'] } },
    walmart: { queries: [{ displayName: 'laptop' }] },
    tiktok: { sug_list: [{ content: 'seo tips' }] },
    'google-scholar': { l: ['seo tools and databases'] },
    quark: { r: [{ w: 'seo' }] },
  };
  const expect = {
    google: ['seo tools', 'seo free'], bing: ['seo a', 'seo b'], yahoo: ['seo y1', 'seo y2'], duckduckgo: ['seo d1', 'seo d2'],
    baidu: ['seo b1'], naver: ['코딩 뜻', '코딩 배우기'], so360: ['手机'], seznam: ['auto esa'], qwant: ['seo q'], amazon: ['laptop stand'],
    ebay: ['iphone 15'], walmart: ['laptop'], tiktok: ['seo tips'], 'google-scholar': ['seo tools and databases'], quark: ['seo'],
  };
  for (const [id, data] of Object.entries(fx)) assert.deepEqual(ENGINE_MAP[id].http.parse(data), expect[id], id);
});

test('cleanText strips tags and entities', () => {
  assert.equal(cleanText(' a <b>b</b> &amp; c  '), 'a b & c');
});
