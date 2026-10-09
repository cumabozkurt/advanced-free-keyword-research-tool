/**
 * Transport-agnostic mining engine shared by the web app, CLI, server and GitHub Action.
 *
 *   const miner = new Miner({ fetcher, engines: ['google','bing'], seeds: ['seo'], ... });
 *   miner.on('result', fn); miner.on('progress', fn); await miner.run();
 *
 * `fetcher(engineId, query, {hl, gl, signal}) -> Promise<string[]>` is injected per platform.
 */
import { expandSeed } from './expand.js';
import { normalizeKeyword } from './normalize.js';

export const DEFAULT_OPTIONS = {
  engines: ['google'],
  seeds: [],
  hl: 'en',
  gl: 'us',
  expansion: {},          // see expand.js DEFAULT_EXPANSION
  depth: 0,               // 0 = only seeds/expansions; 1+ = feed suggestions back as new queries
  expandRecursive: false, // apply expansion strategies on recursive levels too (explodes fast!)
  maxQueries: 2000,       // hard cap of requests per engine
  maxResults: 50000,      // stop when this many unique keywords were found
  delayMs: 400,           // delay between two requests to the SAME engine
  concurrency: 4,         // how many engines may request in parallel
  timeoutMs: 10000,
  retries: 1,
  maxConsecutiveErrors: 6, // disable an engine after this many failures in a row
  mustContainSeed: false, // keep only suggestions containing every seed word
};

const sleep = (ms, signal) => new Promise((resolve) => {
  if (ms <= 0) return resolve();
  const onAbort = () => { clearTimeout(t); resolve(); };
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export class Miner {
  constructor(options = {}) {
    this.o = { ...DEFAULT_OPTIONS, ...options };
    if (typeof this.o.fetcher !== 'function') throw new Error('Miner needs a fetcher(engineId, query, opts)');
    this.listeners = {};
    this.results = new Map(); // norm -> record
    this.abort = new AbortController();
    this.paused = false;
    this.stats = { requests: 0, done: 0, errors: 0, queued: 0, perEngine: {} };
    this.state = 'idle';
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return this; }
  emit(evt, data) { for (const fn of this.listeners[evt] || []) { try { fn(data); } catch (e) { console.error(e); } } }

  stop() { this.abort.abort(); this.paused = false; }
  pause() { this.paused = true; this.emit('state', 'paused'); }
  resume() { this.paused = false; this.emit('state', 'running'); }

  get stopped() { return this.abort.signal.aborted; }

  /** Accept a suggestion and merge it into the de-duplicated result set. */
  addResult(keyword, engineId, task) {
    const norm = normalizeKeyword(keyword);
    if (!norm) return false;
    if (this.o.mustContainSeed) {
      const words = normalizeKeyword(task.seed).split(' ');
      if (!words.every((w) => norm.includes(w))) return false;
    }
    let rec = this.results.get(norm);
    const isNew = !rec;
    if (!rec) {
      if (this.results.size >= this.o.maxResults) return false;
      rec = { keyword: keyword.trim(), norm, engines: new Set(), hits: 0, seed: task.seed, query: task.q, strategy: task.strategy, depth: task.depth, firstSeen: Date.now() };
      this.results.set(norm, rec);
    }
    const before = rec.engines.size;
    rec.engines.add(engineId);
    rec.hits += 1;
    if (isNew || rec.engines.size !== before) this.emit('result', { record: rec, isNew, engine: engineId });
    return isNew;
  }

  async run() {
    const o = this.o;
    this.state = 'running';
    this.emit('state', 'running');
    const signal = this.abort.signal;

    // Per-engine queues so each engine is rate-limited independently.
    const queues = {};
    const seenQueries = {};
    for (const id of o.engines) {
      queues[id] = [];
      seenQueries[id] = new Set();
      this.stats.perEngine[id] = { requests: 0, ok: 0, errors: 0, found: 0, suggestions: 0, disabled: false, lastError: '' };
    }
    const enqueue = (id, task) => {
      const key = normalizeKeyword(task.q);
      if (seenQueries[id].has(key)) return;
      if (seenQueries[id].size >= o.maxQueries) return;
      seenQueries[id].add(key);
      queues[id].push(task);
      this.stats.queued += 1;
    };

    const expansion = { lang: o.hl, ...o.expansion };
    for (const seed of o.seeds) {
      for (const t of expandSeed(seed, expansion)) {
        for (const id of o.engines) enqueue(id, { ...t, seed, depth: 0 });
      }
    }
    this.emitProgress();

    // Simple semaphore for global concurrency.
    let active = 0;
    let inFlight = 0;
    const waiters = [];
    const acquire = async () => {
      while (active >= o.concurrency) await new Promise((r) => waiters.push(r));
      active += 1;
    };
    const release = () => { active -= 1; waiters.shift()?.(); };

    const worker = async (id) => {
      const st = this.stats.perEngine[id];
      let consecutive = 0;
      while (!signal.aborted) {
        while (this.paused && !signal.aborted) await sleep(200, signal);
        const task = queues[id].shift();
        if (!task) {
          // Done only when nobody is working: in-flight tasks may still enqueue recursive work.
          if (inFlight === 0 && this.allQueuesEmpty(queues)) break;
          await sleep(150, signal);
          continue;
        }
        inFlight += 1;
        if (this.results.size >= o.maxResults) { inFlight -= 1; queues[id].length = 0; break; }
        await acquire();
        let suggestions = null;
        let lastErr = null;
        for (let attempt = 0; attempt <= o.retries && !signal.aborted; attempt++) {
          try {
            this.stats.requests += 1; st.requests += 1;
            suggestions = await this.o.fetcher(id, task.q, { hl: o.hl, gl: o.gl, signal, timeoutMs: o.timeoutMs });
            break;
          } catch (err) {
            lastErr = err;
            if (signal.aborted) break;
            // Rate limited -> back off much longer before retrying (be polite, avoid auto-disable storms)
            const limited = /\b(429|503)\b|rate limit/i.test(String(err?.message || err));
            await sleep(limited ? Math.max(5000, o.delayMs * 10) * (attempt + 1) : o.delayMs * (attempt + 2), signal);
          }
        }
        release();
        this.stats.done += 1;
        if (suggestions) {
          consecutive = 0; st.ok += 1; st.suggestions += suggestions.length;
          for (const s of suggestions) {
            const isNew = this.addResult(s, id, task);
            if (isNew) {
              st.found += 1;
              if (task.depth < o.depth) {
                const next = o.expandRecursive
                  ? expandSeed(s, expansion).map((t) => ({ ...t, seed: task.seed, depth: task.depth + 1 }))
                  : [{ q: s, strategy: 'recursive', seed: task.seed, depth: task.depth + 1 }];
                // feed new keyword to ALL selected engines (cross-pollination)
                for (const n of next) for (const eid of o.engines) if (!this.stats.perEngine[eid].disabled) enqueue(eid, n);
              }
            }
          }
        } else if (!signal.aborted) {
          consecutive += 1; st.errors += 1; this.stats.errors += 1;
          st.lastError = String(lastErr?.message || lastErr || 'error');
          this.emit('error', { engine: id, query: task.q, error: st.lastError });
          if (consecutive >= o.maxConsecutiveErrors) {
            st.disabled = true;
            this.stats.queued -= queues[id].length;
            queues[id].length = 0;
            this.emit('engineDisabled', { engine: id, error: st.lastError });
            inFlight -= 1;
            break;
          }
        }
        inFlight -= 1;
        this.emitProgress();
        await sleep(o.delayMs, signal);
      }
    };

    await Promise.all(o.engines.map((id) => worker(id)));
    this.state = signal.aborted ? 'stopped' : 'done';
    this.emitProgress();
    this.emit('state', this.state);
    this.emit('done', { results: this.getResults(), stats: this.stats });
    return this.getResults();
  }

  allQueuesEmpty(queues) { return Object.values(queues).every((q) => q.length === 0); }

  emitProgress() {
    this.emit('progress', { ...this.stats, unique: this.results.size, remaining: Math.max(0, this.stats.queued - this.stats.done) });
  }

  getResults() {
    return [...this.results.values()].map((r) => ({ ...r, engines: [...r.engines] }));
  }
}
