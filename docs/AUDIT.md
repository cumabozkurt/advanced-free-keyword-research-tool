# Pre-release audit — 2026-10-09

Full review of the code, UX, docs, endpoints, proxy security and tests before the first public release.
Every item below was fixed in this release unless marked *known limitation*.

## Language & country

| # | Finding | Fix |
|---|---|---|
| L1 | CLI defaulted to `en`/`us`; the target audience is Turkey | Defaults are now `tr`/`tr` everywhere (`DEFAULT_LOCALE` in `engines.js`): web app, CLI, proxy, GitHub Action |
| L2 | UI said "Dil (hl) / Ülke (gl)" — easy to confuse with the interface language; no explanation which engines use it | Card renamed *Arama dili ve ülkesi*, explanatory hint, quick presets (TR/US/UK/DE/FR/AZ/SA), live line showing which selected engines use language/country, which ignore it, and concrete targets (`Amazon → amazon.com.tr`, Yahoo host, Yandex `lr`, eBay site) |
| L3 | Short lists (18 languages, 22 countries) | ~38 languages (incl. `pt-br`, `zh-cn`, `zh-tw`), ~60 countries; any valid code from a shared URL is accepted |
| L4 | Yahoo always used the US endpoint | Regional hosts for 19 verified countries; TR (empty upstream) and unknown → US |
| L5 | Yandex ignored the country | `lr` region id for 11 countries (TR = 983) |
| L6 | Ecosia sent `mkt=tr-tr` style only by accident; TikTok ignored locale | Ecosia `mkt`, TikTok `region`+`language` wired and tested |
| L7 | Region-tagged languages (`pt-br`, `zh-cn`) produced invalid values for Bing/DDG/Qwant/Swisscows/Wikipedia (`zh-cn-CN`, `pt-br.wikipedia.org`) | Engines that need a bare language use the base language |
| L8 | No visible locale info per engine in CLI | `--list-engines` has a *locale* column (`hl+gl`, `hl`, `gl`, `fixed`) and per-engine notes; run banner prints lang/country and warns about single-market engines |
| L9 | CLI accepted any `--lang/--country` string | Validated (`tr`, `pt-br` / two-letter country) with clear errors |

## Bugs

| # | Finding | Fix |
|---|---|---|
| B1 | `[hidden]` was overridden by `display:grid`, so the custom prefix/suffix inputs were always visible | Global `[hidden]{display:none!important}` |
| B2 | Turkish questions were only detected when the question word came first (`nasıl kahve…`), not `kahve nasıl yapılır`, `seo nedir`, `… mı` | Separate Turkish rule: question words/particles anywhere |
| B3 | Dedup treated `İstanbul` and `istanbul` as different (`İ`→`i̇` outside a Turkish locale) | Normalisation folds U+0307 |
| B4 | Baidu returns invalid JS (`p:,`) for some inputs → JSONP waited 10 s and counted an error (could auto-disable Baidu) | JSONP now fails fast on `onload` without callback; Baidu treats it as "no suggestions" |
| B5 | Engine names were truncated (`Google Sho…`) | Wider cells, names wrap |
| B6 | JSON export meta listed engines that were skipped (no proxy) | Meta stores the engines actually used |
| B7 | Very large result sets re-sorted every 250 ms | Adaptive render throttle (250 / 700 / 1500 ms) |
| B8 | CLI accepted `--depth abc` etc. (NaN silently disabled recursion) | Integer range validation for all numeric flags |
| B9 | `npm test` used a directory argument (breaks on Node ≥ 21 glob semantics) | `node --test test/*.test.js` |

## Proxy & web security

| # | Finding | Fix |
|---|---|---|
| S1 | Engine lookup used a plain object: `engine=constructor` resolved to `Object` (→ 502 instead of 400) | Null-prototype `ENGINE_MAP` + `isEngineId()`; same for Amazon/eBay/Yandex tables |
| S2 | `hl`/`gl` were only sanitised, not validated | Strict validation → 400 |
| S3 | Local server sent `Access-Control-Allow-Origin: *`: any website you visit could use your local proxy | CORS allow-list (`--allow-origin`, default `https://cumabozkurt.github.io`); same-origin always works; Private Network Access preflight supported |
| S4 | Malformed URL encoding returned 500 | 400; NUL bytes rejected |
| S5 | Unbounded upstream response size | 2 MB cap |
| S6 | No security headers | `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` |
| S7 | JSONP lets engine hosts run script in the page | Strict CSP: scripts only from self + the 8 fixed JSONP hosts, no inline script, `object-src 'none'`, `form-action 'none'`; page stores nothing sensitive |
| S8 | Warning missing when binding to a public interface | Server prints a warning for non-loopback hosts |
| S9 | **Found in browser testing:** the proxy's per-IP limit (120/min) throttled the user's *own* browser when 5+ proxy engines ran together → HTTP 429 → engines auto-disabled | Local server exempts loopback clients; limit raised to 1500/min (Worker 1200/min); the miner now backs off ≥5 s on 429 instead of hammering |

Verified: path traversal (`/%2e%2e/…`) → 404, unknown engines → 400, evil origin gets no CORS header, all covered by `test/cli-server.test.js`.

## Endpoints (re-verified 2026-10-09, server + headless Chrome with CSP)

- 24/25 engines return suggestions from Node; Brave answers 429 to non-browser clients (*experimental*, documented).
- Browser (static host, CSP active): all 14 direct engines OK for `tr/tr` and `de/de` (incl. Yahoo regional JSONP).
- Through the local proxy: Yandex, Amazon (amazon.com.tr), Ecosia, Qwant, Swisscows, TikTok, Walmart, Google Scholar, Sogou OK.

## Tests

19 → **33** tests: locale wiring for every locale-aware engine, Yahoo/Amazon/eBay fallbacks, prototype-key safety,
locale validation, alphabet selection, Turkish question detection and `İ` folding, CLI help/validation, server static/traversal/CORS/PNA, proxy `hl/gl` validation.

## Known limitations

- Unofficial endpoints can change without notice — weekly *Endpoint health* workflow + `npm run check`.
- DuckDuckGo's fixed JSONP callback name means a very late (timed-out) response could be attributed to the next DDG query.
- Cloudflare Workers may not support `TextDecoder('gbk')`; Sogou via the Worker can return garbled text (works via local server/CLI).
- Some engines rate-limit bursts from one IP (seen: Ecosia HTTP 503 after a few hundred requests in testing). The miner backs off on 429/503 and disables an engine after 6 consecutive failures; raise the delay for long runs.
- Single-market engines (Baidu, 360, Sogou, Quark, Naver, Seznam, Walmart) ignore language/country by design.
- No search volume / CPC data (would need paid APIs).

## 1.1.0 — Google SERP pagination review

- `/api/serp` is loopback-only with an Origin check (403 otherwise) and returns parsed keyword fields only — no raw HTML, so it cannot be used as a generic fetcher.
- Server-side politeness independent of the client: serialised page loads, ≥4 s gap (`--serp-gap`), 6 h cache, 15-minute cool-down after a CAPTCHA (no Google request at all during it).
- Client/CLI: pages clamped to 1–100, delay ≥2 s, stop on CAPTCHA / consent / JS wall / 3 errors; SERP failures never stop autocomplete (`Miner.alongside`).
- Verified: real Google from the build server → CAPTCHA on page 1, reported in UI and CLI, autocomplete results still exported. Fake-Google E2E (CLI, server, web UI, real Chrome backend) pass.
- CAPTCHA fixture is a real captured page with the IP address and tokens redacted.
