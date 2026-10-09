import { ENGINES, ENGINE_MAP, DEFAULT_ENGINES, CATEGORIES, DEFAULT_LOCALE, isEngineId, isValidLang, isValidCountry, localeSupport, localeTarget } from './engines.js';
import { Miner } from './miner.js';
import { expandSeed, parseSeeds, parseList, ALPHABETS, alphabetKey } from './expand.js';
import { serialize, fileName, MIME } from './export.js';
import { isQuestion, wordCount, normalizeKeyword } from './normalize.js';
import { createBrowserFetcher, browserMode } from './transport-browser.js';
import { t as tr, STRINGS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'afkrt:settings:v1';
const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

const LANGS = [
  ['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'],
  ['pt', 'Português'], ['pt-br', 'Português (Brasil)'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ru', 'Русский'], ['uk', 'Українська'],
  ['az', 'Azərbaycan'], ['ar', 'العربية'], ['fa', 'فارسی'], ['he', 'עברית'], ['hi', 'हिन्दी'], ['ur', 'اردو'], ['bn', 'বাংলা'],
  ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['ja', '日本語'], ['ko', '한국어'],
  ['zh-cn', '中文 (简体)'], ['zh-tw', '中文 (繁體)'], ['el', 'Ελληνικά'], ['ro', 'Română'], ['bg', 'Български'], ['hu', 'Magyar'],
  ['cs', 'Čeština'], ['sv', 'Svenska'], ['da', 'Dansk'], ['no', 'Norsk'], ['fi', 'Suomi'], ['ka', 'ქართული'], ['kk', 'Қазақ'],
];
const COUNTRIES = [
  ['tr', 'Türkiye'], ['us', 'United States'], ['gb', 'United Kingdom'], ['de', 'Deutschland'], ['fr', 'France'], ['es', 'España'],
  ['it', 'Italia'], ['nl', 'Nederland'], ['be', 'België'], ['at', 'Österreich'], ['ch', 'Schweiz'], ['pl', 'Polska'], ['se', 'Sverige'],
  ['no', 'Norge'], ['dk', 'Danmark'], ['fi', 'Suomi'], ['ie', 'Ireland'], ['pt', 'Portugal'], ['gr', 'Ελλάδα'], ['ro', 'România'],
  ['bg', 'България'], ['hu', 'Magyarország'], ['cz', 'Česko'], ['ua', 'Україна'], ['ru', 'Россия'], ['az', 'Azərbaycan'],
  ['ge', 'საქართველო'], ['kz', 'Қазақстан'], ['uz', "O'zbekiston"], ['cy', 'Kıbrıs'], ['ca', 'Canada'], ['mx', 'México'],
  ['br', 'Brasil'], ['ar', 'Argentina'], ['co', 'Colombia'], ['cl', 'Chile'], ['au', 'Australia'], ['nz', 'New Zealand'],
  ['in', 'India'], ['pk', 'Pakistan'], ['bd', 'Bangladesh'], ['id', 'Indonesia'], ['my', 'Malaysia'], ['sg', 'Singapore'],
  ['ph', 'Philippines'], ['vn', 'Việt Nam'], ['th', 'ไทย'], ['jp', '日本'], ['kr', '대한민국'], ['cn', '中国'], ['tw', '台灣'],
  ['hk', '香港'], ['sa', 'السعودية'], ['ae', 'الإمارات'], ['eg', 'مصر'], ['ma', 'المغرب'], ['il', 'ישראל'], ['ir', 'ایران'],
  ['za', 'South Africa'], ['ng', 'Nigeria'],
];
const LOCALE_PRESETS = [['TR', 'tr', 'tr'], ['US', 'en', 'us'], ['UK', 'en', 'gb'], ['DE', 'de', 'de'], ['FR', 'fr', 'fr'], ['AZ', 'az', 'az'], ['SA', 'ar', 'sa']];
const EXPANSIONS = ['seed', 'alphaSuffix', 'alphaPrefix', 'digitSuffix', 'questions', 'modifiers', 'custom'];

const state = {
  lang: 'tr',
  miner: null,
  records: [],          // all records (live references from miner)
  recordIndex: new Map(),
  limit: 500,
  proxyAuto: '',
  renderPending: false,
  notices: [],
};

// ---------------- settings ----------------
const defaults = () => ({
  ui: (navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en',
  seeds: '', hl: DEFAULT_LOCALE.hl, gl: DEFAULT_LOCALE.gl, engines: DEFAULT_ENGINES,
  expansion: { seed: true, alphaSuffix: true }, customPrefixes: '', customSuffixes: '',
  depth: 0, maxQueries: 300, delay: 350, concurrency: 4, expandRecursive: false, mustContain: false, proxyUrl: '',
});
function loadSettings() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { return defaults(); }
}
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(readForm())); } catch { /* private mode */ }
}

// ---------------- i18n ----------------
const t = (key, vars) => tr(state.lang, key, vars);
function applyI18n() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  $('langToggle').textContent = t('lang');
  $('langToggle').title = t('langTitle');
  renderEngines(readEnginesSelection());
  renderExpansions(readExpansionSelection());
  renderLocalePresets();
  updateSeedCount();
  updateLocaleInfo();
  updateControls();
  scheduleRender();
}

// ---------------- builders ----------------
function fillSelect(sel, items, value) {
  sel.replaceChildren(...items.map(([v, label]) => new Option(`${label} (${v})`, v)));
  setSelect(sel, value);
}
/** Select a value, adding it as an option if it's a valid code not in the list (e.g. from a shared URL). */
function setSelect(sel, value) {
  if (!value) return;
  if (![...sel.options].some((o) => o.value === value)) sel.append(new Option(value, value));
  sel.value = value;
}

function renderLocalePresets() {
  const box = $('localePresets');
  box.replaceChildren(...LOCALE_PRESETS.map(([label, hl, gl]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link'; b.textContent = label; b.title = `hl=${hl} · gl=${gl}`;
    b.addEventListener('click', () => { setSelect($('hl'), hl); setSelect($('gl'), gl); onLocaleChange(); });
    return b;
  }));
}

function updateLocaleInfo() {
  const o = { hl: $('hl').value, gl: $('gl').value };
  const sel = readEnginesSelection().map((id) => ENGINE_MAP[id]);
  const uses = sel.filter((e) => localeSupport(e) !== 'fixed');
  const fixed = sel.filter((e) => localeSupport(e) === 'fixed');
  const targets = sel.map((e) => [e, localeTarget(e, o)]).filter(([, x]) => x).map(([e, x]) => `${e.name} → ${x}`);
  const ak = alphabetKey(o.hl);
  const parts = [];
  if (uses.length) parts.push(t('localeUses', { list: uses.map((e) => `${e.name} (${t(`loc_${localeSupport(e)}`)})`).join(', ') }));
  if (fixed.length) parts.push(t('localeFixed', { list: fixed.map((e) => `${e.name}${e.region ? ` [${e.region}]` : ''}`).join(', ') }));
  if (targets.length) parts.push(t('localeTargets', { list: targets.join(', ') }));
  parts.push(t('alphabetInfo', { n: ALPHABETS[ak].length, lang: ak }));
  $('localeInfo').textContent = parts.join(' ');
}

function onLocaleChange() { updateLocaleInfo(); updateSeedCount(); saveSettings(); }

function proxyUrl() { return ($('proxyUrl').value.trim() || state.proxyAuto).replace(/\/+$/, ''); }

function renderEngines(selected) {
  const box = $('engineList');
  const sel = new Set(selected);
  const proxy = proxyUrl();
  box.replaceChildren();
  for (const cat of CATEGORIES) {
    const list = ENGINES.filter((e) => e.category === cat);
    if (!list.length) continue;
    const group = document.createElement('div');
    group.className = 'engine-group';
    const h = document.createElement('h3');
    h.textContent = t(`cat_${cat}`);
    const grid = document.createElement('div');
    grid.className = 'engine-grid';
    for (const e of list) {
      const mode = browserMode(e, proxy);
      const label = document.createElement('label');
      label.className = `engine${mode ? '' : ' unavailable'}`;
      label.title = `${e.name} — ${e.backend}${e.region ? ` (${e.region})` : ''}${e.experimental ? ` · ${t('experimental')}` : ''}`;
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = e.id; input.checked = sel.has(e.id); input.name = 'engine';
      const name = document.createElement('span');
      name.className = 'name'; name.textContent = e.name;
      const badge = document.createElement('span');
      const native = e.jsonp || e.cors;
      badge.className = `badge ${native ? 'direct' : 'proxy'}`;
      badge.textContent = native ? t('direct') : t('needsProxy') + (e.experimental ? '*' : '');
      label.append(input, name);
      if (e.region) { const r = document.createElement('span'); r.className = 'badge'; r.textContent = e.region; r.title = 'single market'; label.append(r); }
      label.append(badge);
      grid.append(label);
    }
    group.append(h, grid);
    box.append(group);
  }
}

function renderExpansions(sel) {
  const box = $('expansionList');
  box.replaceChildren(...EXPANSIONS.map((k) => {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.dataset.exp = k; input.checked = Boolean(sel[k]);
    const span = document.createElement('span');
    span.textContent = t(`ex_${k}`);
    label.append(input, span);
    return label;
  }));
  $('customBox').hidden = !sel.custom;
}

const readEnginesSelection = () => [...document.querySelectorAll('input[name=engine]:checked')].map((i) => i.value);
const readExpansionSelection = () => Object.fromEntries([...document.querySelectorAll('[data-exp]')].map((i) => [i.dataset.exp, i.checked]));
const num = (id, min, max, def) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def; };

function readForm() {
  return {
    ui: state.lang,
    seeds: $('seeds').value,
    hl: $('hl').value, gl: $('gl').value,
    engines: readEnginesSelection(),
    expansion: readExpansionSelection(),
    customPrefixes: $('customPrefixes').value, customSuffixes: $('customSuffixes').value,
    depth: num('depth', 0, 5, 0), maxQueries: num('maxQueries', 1, 20000, 300),
    delay: num('delay', 100, 10000, 350), concurrency: num('concurrency', 1, 12, 4),
    expandRecursive: $('expandRecursive').checked, mustContain: $('mustContain').checked,
    proxyUrl: $('proxyUrl').value.trim(),
  };
}

function expansionOptions(f) {
  return { ...f.expansion, customPrefixes: parseList(f.customPrefixes), customSuffixes: parseList(f.customSuffixes), lang: f.hl };
}

function updateSeedCount() {
  const seeds = parseSeeds($('seeds').value);
  $('seedCount').textContent = t('seedCount', { n: seeds.length });
  const f = readForm();
  const usable = f.engines.filter((id) => browserMode(ENGINE_MAP[id], proxyUrl()));
  const perSeed = seeds.length ? expandSeed(seeds[0], expansionOptions(f)).length : 0;
  const total = Math.min(seeds.length * perSeed, f.maxQueries) * usable.length;
  $('estimate').textContent = total ? t('estimate', { n: total.toLocaleString() }) + (f.depth ? ' + …' : '') : '';
}

// ---------------- run ----------------
function notice(msg) {
  state.notices.push(msg);
  const box = $('notice');
  box.hidden = false;
  const p = document.createElement('p');
  p.textContent = msg;
  box.append(p);
}
function clearNotices() { state.notices = []; $('notice').replaceChildren(); $('notice').hidden = true; }

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2200);
}

async function start(ev) {
  ev?.preventDefault();
  if (state.miner && state.miner.state === 'running') return;
  const f = readForm();
  const seeds = parseSeeds(f.seeds);
  clearNotices();
  if (!seeds.length) { notice(t('noSeeds')); $('seeds').focus(); return; }
  const proxy = proxyUrl();
  const usable = f.engines.filter((id) => browserMode(ENGINE_MAP[id], proxy));
  const skipped = f.engines.filter((id) => !usable.includes(id));
  if (skipped.length) notice(t('proxyMissing', { list: skipped.map((id) => ENGINE_MAP[id].name).join(', ') }));
  if (!usable.length) { notice(t('noEngines')); return; }
  saveSettings();

  state.lastMeta = { seeds, engines: usable, lang: f.hl, country: f.gl, depth: f.depth };
  const miner = new Miner({
    fetcher: createBrowserFetcher({ proxyUrl: proxy }),
    engines: usable, seeds, hl: f.hl, gl: f.gl,
    expansion: expansionOptions(f), depth: f.depth, expandRecursive: f.expandRecursive,
    mustContainSeed: f.mustContain, delayMs: f.delay, concurrency: f.concurrency, maxQueries: f.maxQueries,
  });
  state.miner = miner;
  miner.on('result', ({ record, isNew }) => {
    if (isNew) { state.records.push(record); state.recordIndex.set(record.norm, record); }
    scheduleRender();
  });
  miner.on('progress', updateStats);
  miner.on('state', updateControls);
  miner.on('engineDisabled', ({ engine, error }) => notice(t('engineDisabled', { engine: ENGINE_MAP[engine].name, error })));
  updateControls();
  // merge with previous results (so users can run several batches)
  for (const r of state.records) miner.results.set(r.norm, r);
  await miner.run();
  toast(miner.state === 'stopped' ? t('stopped', { n: state.records.length }) : t('done', { n: state.records.length }));
  updateControls();
  scheduleRender();
}

function updateControls() {
  const m = state.miner;
  const running = m && (m.state === 'running');
  $('startBtn').disabled = Boolean(running);
  $('pauseBtn').disabled = !running;
  $('stopBtn').disabled = !running;
  $('pauseBtn').textContent = m?.paused ? t('resume') : t('pause');
}

function updateStats(p) {
  $('statUnique').textContent = state.records.length.toLocaleString();
  $('statRequests').textContent = p.done.toLocaleString();
  $('statRemaining').textContent = p.remaining.toLocaleString();
  $('statErrors').textContent = p.errors.toLocaleString();
  const pct = p.queued ? Math.round((p.done / p.queued) * 100) : 0;
  $('progressBar').style.width = `${pct}%`;
  $('progressBar').parentElement.setAttribute('aria-valuenow', String(pct));
  const box = $('engineStats');
  box.replaceChildren(...Object.entries(p.perEngine).map(([id, s]) => {
    const el = document.createElement('span');
    el.className = `estat${s.disabled || s.errors > s.ok ? ' err' : ''}`;
    el.title = `${t('requests')}: ${s.requests} · suggestions: ${s.suggestions} · new: ${s.found}${s.lastError ? ` · ${s.lastError}` : ''}`;
    const b = document.createElement('b');
    b.textContent = ENGINE_MAP[id].name;
    el.append(b, ` ${s.suggestions} (+${s.found}) · ${s.requests}${s.errors ? ` · ⚠${s.errors}` : ''}`);
    return el;
  }));
}

// ---------------- results view ----------------
function filtered() {
  const q = normalizeKeyword($('filter').value);
  const ex = parseList($('exclude').value.toLowerCase()).map(normalizeKeyword);
  const onlyQ = $('onlyQuestions').checked;
  const minW = Number($('minWords').value) || 1;
  let list = state.records.filter((r) => (!q || r.norm.includes(q))
    && (!ex.length || !ex.some((w) => r.norm.includes(w)))
    && (!onlyQ || isQuestion(r.keyword))
    && (minW <= 1 || wordCount(r.keyword) >= minW));
  const sort = $('sort').value;
  const cmp = {
    engines: (a, b) => b.engines.size - a.engines.size || b.hits - a.hits || a.norm.localeCompare(b.norm),
    hits: (a, b) => b.hits - a.hits || b.engines.size - a.engines.size,
    az: (a, b) => a.norm.localeCompare(b.norm, state.lang),
    length: (a, b) => a.keyword.length - b.keyword.length,
    found: (a, b) => a.firstSeen - b.firstSeen,
  }[sort];
  list = [...list].sort(cmp);
  return list;
}

function scheduleRender() {
  if (state.renderPending) return;
  state.renderPending = true;
  const wait = state.records.length > 20000 ? 1500 : state.records.length > 5000 ? 700 : 250;
  setTimeout(() => { state.renderPending = false; render(); }, wait);
}

function render() {
  const list = filtered();
  const shown = list.slice(0, state.limit);
  const frag = document.createDocumentFragment();
  shown.forEach((r, i) => {
    const tr = document.createElement('tr');
    const n = document.createElement('td'); n.className = 'num-col'; n.textContent = String(i + 1);
    const kw = document.createElement('td');
    const wrap = document.createElement('div'); wrap.className = 'kw';
    const text = document.createElement('span'); text.className = 'kw-text'; text.textContent = r.keyword;
    wrap.append(text);
    if (isQuestion(r.keyword)) { const qt = document.createElement('span'); qt.className = 'q-tag'; qt.textContent = '?'; qt.title = t('onlyQuestions'); wrap.append(qt); }
    const acts = document.createElement('span'); acts.className = 'kw-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'icon-btn'; copy.innerHTML = COPY_ICON; copy.title = t('copyKeyword'); copy.setAttribute('aria-label', `${t('copyKeyword')}: ${r.keyword}`);
    copy.dataset.copy = r.keyword;
    const a = document.createElement('a'); a.className = 'icon-btn'; a.textContent = '↗'; a.title = t('searchKeyword'); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.href = `https://www.google.com/search?q=${encodeURIComponent(r.keyword)}`;
    acts.append(copy, a); wrap.append(acts); kw.append(wrap);
    const eng = document.createElement('td');
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const id of r.engines) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = ENGINE_MAP[id]?.name || id; chips.append(c); }
    eng.append(chips);
    const hits = document.createElement('td'); hits.className = 'num-col'; hits.textContent = String(r.hits);
    const words = document.createElement('td'); words.className = 'num-col hide-sm'; words.textContent = String(wordCount(r.keyword));
    const seed = document.createElement('td'); seed.className = 'seed-cell hide-sm'; seed.textContent = r.seed; seed.title = `${r.query} (${r.strategy}, depth ${r.depth})`;
    tr.append(n, kw, eng, hits, words, seed);
    frag.append(tr);
  });
  $('tbody').replaceChildren(frag);
  $('empty').hidden = state.records.length > 0;
  $('showing').textContent = state.records.length ? t('showing', { shown: shown.length.toLocaleString(), total: list.length.toLocaleString() }) + (list.length !== state.records.length ? ` (${state.records.length.toLocaleString()} total)` : '') : '';
  $('showMore').hidden = list.length <= shown.length;
  $('statUnique').textContent = state.records.length.toLocaleString();
}

function exportRecords() {
  const list = $('exportFiltered').checked ? filtered() : [...state.records];
  return list.map((r) => ({ ...r, engines: [...r.engines] }));
}

function download(format) {
  const recs = exportRecords();
  if (!recs.length) { toast(t('empty')); return; }
  const f = readForm();
  const seeds = parseSeeds(f.seeds);
  const meta = state.lastMeta || { seeds, engines: f.engines, lang: f.hl, country: f.gl };
  const blob = new Blob([serialize(format, recs, meta)], { type: MIME[format] });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(seeds, format);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(t('copied'));
  }
}

// ---------------- proxy ----------------
async function testProxy(url, silent = false) {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    const ok = res.ok && (await res.json()).ok;
    if (!silent) $('proxyStatus').textContent = ok ? t('proxyOk') : t('proxyFail');
    return ok;
  } catch {
    if (!silent) $('proxyStatus').textContent = t('proxyFail');
    return false;
  }
}

// ---------------- init ----------------
function init() {
  const s = loadSettings();
  state.lang = STRINGS[s.ui] ? s.ui : 'tr';
  fillSelect($('hl'), LANGS, isValidLang(s.hl) ? s.hl : DEFAULT_LOCALE.hl);
  fillSelect($('gl'), COUNTRIES, isValidCountry(s.gl) ? s.gl : DEFAULT_LOCALE.gl);
  $('seeds').value = s.seeds;
  $('customPrefixes').value = s.customPrefixes; $('customSuffixes').value = s.customSuffixes;
  $('depth').value = s.depth; $('maxQueries').value = s.maxQueries; $('delay').value = s.delay; $('concurrency').value = s.concurrency;
  $('expandRecursive').checked = s.expandRecursive; $('mustContain').checked = s.mustContain;
  $('proxyUrl').value = s.proxyUrl;
  renderEngines((s.engines || []).filter(isEngineId));
  renderExpansions(s.expansion || {});

  // URL params: ?q=seo+tools&engines=google,bing&hl=en&gl=us&run=1
  const params = new URLSearchParams(location.search);
  if (params.get('q')) $('seeds').value = params.getAll('q').join('\n');
  const phl = (params.get('hl') || '').toLowerCase();
  const pgl = (params.get('gl') || '').toLowerCase();
  if (isValidLang(phl)) setSelect($('hl'), phl);
  if (isValidCountry(pgl)) setSelect($('gl'), pgl);
  if (params.get('engines')) renderEngines(params.get('engines').split(',').filter(isEngineId));
  if (params.get('lang') && STRINGS[params.get('lang')]) state.lang = params.get('lang');

  applyI18n();

  $('form').addEventListener('submit', start);
  $('pauseBtn').addEventListener('click', () => { const m = state.miner; if (!m) return; m.paused ? m.resume() : m.pause(); updateControls(); });
  $('stopBtn').addEventListener('click', () => state.miner?.stop());
  $('clearBtn').addEventListener('click', () => {
    if (state.miner?.state === 'running') return;
    state.records = []; state.recordIndex.clear(); state.limit = 500; clearNotices();
    for (const id of ['statUnique', 'statRequests', 'statRemaining', 'statErrors']) $(id).textContent = '0';
    $('progressBar').style.width = '0'; $('engineStats').replaceChildren();
    render();
  });
  $('langToggle').addEventListener('click', () => { state.lang = state.lang === 'tr' ? 'en' : 'tr'; applyI18n(); saveSettings(); });
  $('form').addEventListener('change', (e) => {
    if (e.target.dataset?.exp === 'custom') $('customBox').hidden = !e.target.checked;
    if (e.target.id === 'proxyUrl') renderEngines(readEnginesSelection());
    updateLocaleInfo(); updateSeedCount(); saveSettings();
  });
  $('seeds').addEventListener('input', () => { updateSeedCount(); clearTimeout(init.t); init.t = setTimeout(saveSettings, 400); });
  $('seedFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const merged = parseSeeds(`${$('seeds').value}\n${text}`);
    $('seeds').value = merged.join('\n');
    e.target.value = '';
    updateSeedCount(); saveSettings();
  });
  document.querySelectorAll('[data-select]').forEach((b) => b.addEventListener('click', () => {
    const mode = b.dataset.select;
    const proxy = proxyUrl();
    const ids = mode === 'all' ? ENGINES.filter((e) => browserMode(e, proxy) && !e.experimental).map((e) => e.id) : mode === 'default' ? DEFAULT_ENGINES : [];
    renderEngines(ids); updateLocaleInfo(); updateSeedCount(); saveSettings();
  }));
  for (const id of ['filter', 'exclude', 'minWords', 'onlyQuestions', 'sort']) $(id).addEventListener('input', () => { state.limit = 500; scheduleRender(); });
  $('showMore').addEventListener('click', () => { state.limit += 1000; render(); });
  document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => download(b.dataset.export)));
  $('copyAll').addEventListener('click', () => copyText(exportRecords().map((r) => r.keyword).join('\n')));
  $('tbody').addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
  $('proxyTest').addEventListener('click', () => testProxy($('proxyUrl').value.trim()));
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') start(e); });

  // Auto-detect the local server proxy when the app is served by `npm start`.
  if (location.protocol.startsWith('http') && !/github\.io$/.test(location.hostname)) {
    testProxy(location.origin, true).then((ok) => {
      if (ok) { state.proxyAuto = location.origin; $('proxyStatus').textContent = t('proxyAuto'); renderEngines(readEnginesSelection()); updateSeedCount(); }
    });
  }
  render();
  if (params.get('run') === '1' && parseSeeds($('seeds').value).length) start();
}

init();
