#!/usr/bin/env node
/**
 * Advanced Free Keyword Research Tool — CLI
 *
 *   afkrt "seo tools"
 *   afkrt -f seeds.txt -e google,bing,amazon,youtube -x alpha,questions -d 1 -o out.csv
 *   afkrt --list-engines
 *   afkrt "kahve makinesi" --serp --serp-pages 10     (also walk Google result pages)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { ENGINES, DEFAULT_ENGINES, DEFAULT_LOCALE, isEngineId, isValidLang, isValidCountry, localeSupport } from '../web/js/engines.js';
import { Miner } from '../web/js/miner.js';
import { parseSeeds, parseList } from '../web/js/expand.js';
import { serialize, FORMATS } from '../web/js/export.js';
import { createHttpFetcher } from '../lib/http-fetcher.js';
import { runSerpPhase, SERP_LIMITS } from '../web/js/serp-client.js';

const HELP = `
Advanced Free Keyword Research Tool (CLI)

Usage:
  afkrt [options] [keyword ...]

Input:
  -f, --file <path>         Read seed keywords from a file (one per line, or comma separated)
  (stdin)                   Seeds can also be piped:  cat seeds.txt | afkrt -o out.txt

Engines:
  -e, --engines <list>      Comma separated engine ids, or "all" / "web" / "shopping" / "video"
                            (default: ${DEFAULT_ENGINES.join(',')})
      --list-engines        Show all engines and exit

Expansion (long-tail):
  -x, --expand <list>       Strategies: alpha, alpha-prefix, digits, questions, modifiers, none
                            (default: alpha)
      --prefixes <list>     Custom prefixes  (comma separated)
      --suffixes <list>     Custom suffixes  (comma separated)
  -d, --depth <n>           Recursive depth: feed new suggestions back (default 0)
      --expand-recursive    Also apply expansion strategies on recursive levels (huge!)
      --must-contain        Keep only suggestions containing every seed word

Locale (search language & country — sent to every engine that supports it):
  -l, --lang <hl>           Search language, ISO 639-1: tr, en, de, fr, ar, ru… (default ${DEFAULT_LOCALE.hl})
  -c, --country <gl>        Search country/region, ISO 3166-1 alpha-2: tr, us, gb, de… (default ${DEFAULT_LOCALE.gl})
                            Also picks the Amazon marketplace, eBay site, Yahoo region, Yandex region,
                            and the alphabet / question words used for expansion.
                            See which engines use them:  afkrt --list-engines

Limits / politeness:
      --delay <ms>          Delay between requests to the same engine (default 400)
      --concurrency <n>     Engines queried in parallel (default 4)
      --max-queries <n>     Max requests per engine (default 2000)
      --max-results <n>     Stop after N unique keywords (default 50000)
      --timeout <ms>        Request timeout (default 10000)
      --user-agent <ua>     Override the User-Agent header

Google result pages (SERP) — optional, needs \`npm install\` + local Chrome/Chromium/Edge:
      --serp                Also walk Google result pages (start=0,10,20…) for every seed and collect
                            related searches + "People also ask" (+ organic titles if requested)
      --serp-pages <n>      Pages per seed, 1–100 (default ${SERP_LIMITS.defaultPages}). Google often has fewer.
      --serp-sources <list> related, paa, organic  (default related,paa)
      --serp-delay <ms>     Pause between two page loads, min ${SERP_LIMITS.minDelayMs} (default ${SERP_LIMITS.defaultDelayMs})
      --serp-backend <b>    browser (default, your installed Chrome) | html (plain HTTP; usually JS-walled)
      --serp-headful        Show the browser window
      --serp-chrome <path>  Browser executable (or set CHROME_PATH)
      --serp-profile <dir>  Browser profile directory to reuse (keeps Google's cookie-consent choice)
      --serp-only           Only SERP pages, skip autocomplete engines
                            Stops immediately on CAPTCHA / unusual-traffic pages (no solving, no evasion).
                            Automated SERP access is against Google's ToS — see README.

Output:
  -o, --out <file>          Output file; format from extension (.txt .csv .tsv .json .md)
                            Can be repeated:  -o out.txt -o out.csv
      --format <fmt>        Format for stdout when no -o is given (default txt)
  -q, --quiet               No progress output
  -h, --help                Show help
`;

function parseArgs(argv) {
  const a = { seeds: [], outs: [], engines: null, expand: 'alpha', depth: 0, lang: DEFAULT_LOCALE.hl, country: DEFAULT_LOCALE.gl, delay: 400, concurrency: 4, maxQueries: 2000, maxResults: 50000, timeout: 10000, format: 'txt' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`Missing value for ${k}`); return x; };
    switch (k) {
      case '-h': case '--help': a.help = true; break;
      case '-f': case '--file': a.file = v(); break;
      case '-e': case '--engines': a.engines = v(); break;
      case '--list-engines': a.list = true; break;
      case '-x': case '--expand': a.expand = v(); break;
      case '--prefixes': a.prefixes = v(); break;
      case '--suffixes': a.suffixes = v(); break;
      case '-d': case '--depth': a.depth = Number(v()); break;
      case '--expand-recursive': a.expandRecursive = true; break;
      case '--must-contain': a.mustContain = true; break;
      case '-l': case '--lang': a.lang = v().toLowerCase(); break;
      case '-c': case '--country': a.country = v().toLowerCase(); break;
      case '--delay': a.delay = Number(v()); break;
      case '--concurrency': a.concurrency = Number(v()); break;
      case '--max-queries': a.maxQueries = Number(v()); break;
      case '--max-results': a.maxResults = Number(v()); break;
      case '--timeout': a.timeout = Number(v()); break;
      case '--user-agent': a.userAgent = v(); break;
      case '--serp': a.serp = true; break;
      case '--serp-only': a.serp = true; a.serpOnly = true; break;
      case '--serp-pages': a.serp = true; a.serpPages = Number(v()); break;
      case '--serp-sources': a.serpSources = v(); break;
      case '--serp-delay': a.serpDelay = Number(v()); break;
      case '--serp-backend': a.serpBackend = v(); break;
      case '--serp-headful': a.serpHeadful = true; break;
      case '--serp-chrome': a.serpChrome = v(); break;
      case '--serp-profile': a.serpProfile = v(); break;
      case '--serp-base-url': a.serpBaseUrl = v(); break; // tests: fake Google
      case '-o': case '--out': a.outs.push(v()); break;
      case '--format': a.format = v(); break;
      case '-q': case '--quiet': a.quiet = true; break;
      default:
        if (k.startsWith('-')) throw new Error(`Unknown option ${k}`);
        a.seeds.push(k);
    }
  }
  if (!isValidLang(a.lang)) throw new Error(`Invalid --lang "${a.lang}" (use a code like tr, en, de, pt-br)`);
  if (!isValidCountry(a.country)) throw new Error(`Invalid --country "${a.country}" (use a 2-letter code like tr, us, gb)`);
  const ints = { depth: [0, 10], delay: [0, 60000], concurrency: [1, 32], maxQueries: [1, 1e6], maxResults: [1, 1e7], timeout: [1000, 120000] };
  for (const [k, [min, max]] of Object.entries(ints)) {
    if (!Number.isInteger(a[k]) || a[k] < min || a[k] > max) throw new Error(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be an integer between ${min} and ${max}`);
  }
  if (a.serp) {
    a.serpPages ??= SERP_LIMITS.defaultPages;
    a.serpDelay ??= SERP_LIMITS.defaultDelayMs;
    a.serpBackend ??= 'browser';
    if (!Number.isInteger(a.serpPages) || a.serpPages < SERP_LIMITS.minPages || a.serpPages > SERP_LIMITS.maxPages) throw new Error(`--serp-pages must be an integer between 1 and ${SERP_LIMITS.maxPages}`);
    const minDelay = a.serpBaseUrl ? 0 : SERP_LIMITS.minDelayMs;
    if (!Number.isInteger(a.serpDelay) || a.serpDelay < minDelay || a.serpDelay > 600000) throw new Error(`--serp-delay must be an integer between ${SERP_LIMITS.minDelayMs} and 600000`);
    if (!['browser', 'html'].includes(a.serpBackend)) throw new Error('--serp-backend must be browser or html');
    a.serpSourceList = parseList((a.serpSources || 'related,paa').toLowerCase());
    for (const x of a.serpSourceList) if (!['related', 'paa', 'organic'].includes(x)) throw new Error(`Unknown --serp-sources entry "${x}" (use related, paa, organic)`);
    if (!a.serpSourceList.length) throw new Error('--serp-sources is empty');
  }
  return a;
}

function resolveEngines(spec) {
  if (!spec) return DEFAULT_ENGINES;
  const out = new Set();
  for (const part of parseList(spec.toLowerCase())) {
    if (part === 'all') ENGINES.filter((e) => !e.experimental).forEach((e) => out.add(e.id));
    else if (ENGINES.some((e) => e.category === part)) ENGINES.filter((e) => e.category === part && !e.experimental).forEach((e) => out.add(e.id));
    else if (isEngineId(part)) out.add(part);
    else throw new Error(`Unknown engine "${part}". Use --list-engines.`);
  }
  return [...out];
}

function resolveExpansion(spec, a) {
  const set = new Set(parseList(spec.toLowerCase()));
  const none = set.has('none');
  return {
    seed: true,
    alphaSuffix: !none && (set.has('alpha') || set.has('alpha-suffix')),
    alphaPrefix: !none && set.has('alpha-prefix'),
    digitSuffix: !none && set.has('digits'),
    questions: !none && set.has('questions'),
    modifiers: !none && set.has('modifiers'),
    custom: Boolean(a.prefixes || a.suffixes),
    customPrefixes: parseList(a.prefixes),
    customSuffixes: parseList(a.suffixes),
    lang: a.lang,
  };
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { console.log(HELP); return; }
  if (a.list) {
    console.log('id               category   browser  locale  notes');
    for (const e of ENGINES) console.log(`${e.id.padEnd(16)} ${e.category.padEnd(10)} ${(e.jsonp ? 'jsonp' : e.cors ? 'cors' : 'proxy').padEnd(8)} ${localeSupport(e).padEnd(7)} ${e.backend}${e.region ? ` · ${e.region} only` : ''}${e.localeNote ? ` · ${e.localeNote}` : ''}${e.experimental ? ' · experimental' : ''}`);
    console.log('\nlocale: hl+gl = language and country used · hl = language only · gl = country only · fixed = ignores both');
    return;
  }

  let seedText = a.seeds.join('\n');
  if (a.file) seedText += `\n${await readFile(a.file, 'utf8')}`;
  if (!a.seeds.length && !a.file) seedText += `\n${await readStdin()}`;
  const seeds = parseSeeds(seedText);
  if (!seeds.length) { console.error('No seed keywords. Try: afkrt "seo tools"  (or --help)'); process.exitCode = 2; return; }

  const engines = a.serpOnly ? [] : resolveEngines(a.engines);
  const log = (...m) => { if (!a.quiet) process.stderr.write(`${m.join(' ')}\n`); };
  log(`▸ ${seeds.length} seed(s) · lang ${a.lang} · country ${a.country} · engines: ${engines.join(', ')} · depth ${a.depth}`);
  if (a.serp) log(`  + Google SERP: ${a.serpPages} page(s)/seed · sources ${a.serpSourceList.join(',')} · ${a.serpDelay} ms between pages · ${a.serpBackend} backend`);
  const fixed = engines.filter((id) => localeSupport(ENGINES.find((e) => e.id === id)) === 'fixed');
  if (fixed.length) log(`  note: ${fixed.join(', ')} ignore language/country (single-market engines)`);

  let serpBackend = null;
  const alongside = [];
  if (a.serp) {
    const { createSerpBackend } = await import('../lib/google-serp.js');
    serpBackend = createSerpBackend({ backend: a.serpBackend, headful: a.serpHeadful, chromePath: a.serpChrome, userDataDir: a.serpProfile, baseUrl: a.serpBaseUrl });
    alongside.push((m) => runSerpPhase({
      miner: m, seeds, fetchPage: serpBackend.fetchPage, pages: a.serpPages, sources: a.serpSourceList,
      delayMs: a.serpDelay, minDelayMs: a.serpBaseUrl ? 0 : SERP_LIMITS.minDelayMs,
      onStatus: (s) => {
        if (s.type === 'blocked') {
          const hint = { captcha: 'Google asked for a CAPTCHA (unusual traffic). Not solved by design — try later, fewer pages, a longer --serp-delay, or a normal home connection', jswall: 'Google requires JavaScript for this client — use --serp-backend browser', consent: 'Google showed a cookie-consent page — try --serp-headful once and accept it with a --serp-profile, or another country', unavailable: 'browser backend not available' }[s.status] || '';
          log(`\n  ⚠ Google SERP stopped on page ${s.page} for "${s.seed}": ${s.status}${s.error && s.error !== s.status ? ` (${s.error})` : ''}${hint ? ` — ${hint}` : ''}.${engines.length ? ' Autocomplete engines continue.' : ''}`);
        }
        else if (s.type === 'error') log(`\n  ⚠ Google SERP page ${s.page} for "${s.seed}" failed: ${s.error}`);
        else if (s.type === 'end') log(`\n  · Google SERP: "${s.seed}" has no more result pages after page ${s.page}`);
      },
    }));
  }

  const miner = new Miner({
    alongside,
    fetcher: createHttpFetcher(a.userAgent ? { userAgent: a.userAgent } : {}),
    engines, seeds, hl: a.lang, gl: a.country,
    expansion: resolveExpansion(a.expand, a), depth: a.depth, expandRecursive: a.expandRecursive,
    mustContainSeed: a.mustContain, delayMs: a.delay, concurrency: a.concurrency,
    maxQueries: a.maxQueries, maxResults: a.maxResults, timeoutMs: a.timeout,
  });
  let lastPrint = 0;
  miner.on('progress', (p) => {
    if (a.quiet || !process.stderr.isTTY) return;
    const now = Date.now();
    if (now - lastPrint < 200) return;
    lastPrint = now;
    process.stderr.write(`\r  requests ${p.done}/${p.queued} · unique keywords ${p.unique} · errors ${p.errors}   `);
  });
  miner.on('engineDisabled', ({ engine, error }) => log(`\n  ⚠ ${engine} disabled after repeated errors (${error})`));
  process.on('SIGINT', () => { log('\n  ■ stopping… (partial results will be saved)'); miner.stop(); });

  let results;
  try { results = await miner.run(); } finally { await serpBackend?.close(); }
  results.sort((x, y) => y.engines.length - x.engines.length || y.hits - x.hits || x.keyword.localeCompare(y.keyword));
  if (!a.quiet && process.stderr.isTTY) process.stderr.write('\n');
  log(`✔ ${results.length} unique keywords from ${miner.stats.done} requests (${miner.stats.errors} errors)`);
  for (const [id, s] of Object.entries(miner.stats.perEngine)) log(`   ${id.padEnd(16)} req ${String(s.requests).padStart(5)}  new ${String(s.found).padStart(5)}  err ${s.errors}${s.disabled ? '  (disabled)' : ''}`);

  const meta = { seeds, engines, lang: a.lang, country: a.country, depth: a.depth, ...(a.serp ? { serp: { pages: a.serpPages, sources: a.serpSourceList } } : {}) };
  if (!a.outs.length) {
    if (!FORMATS.includes(a.format)) throw new Error(`Unknown format ${a.format}`);
    process.stdout.write(serialize(a.format, results, meta));
    return;
  }
  for (const out of a.outs) {
    const fmt = extname(out).slice(1).toLowerCase() || 'txt';
    if (!FORMATS.includes(fmt)) throw new Error(`Unsupported output extension .${fmt} (use ${FORMATS.join(', ')})`);
    await mkdir(dirname(out), { recursive: true }).catch(() => {});
    await writeFile(out, serialize(fmt, results, meta));
    log(`  → ${out}`);
  }
}

main().catch((err) => { console.error(`Error: ${err.message}`); process.exitCode = 1; });
