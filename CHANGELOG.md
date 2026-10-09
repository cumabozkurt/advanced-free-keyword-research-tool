# Changelog

## 1.1.0 — 2026-10-09

- **Google result-page (SERP) mining** (CLI + local server + web app via local server): walks `start=0,10,20…` up to 1–100 pages per seed,
  collects related searches, People-also-ask and optional organic titles, tagged `serp-related` / `serp-paa` / `serp-organic`, merged and de-duplicated
  with autocomplete results. `hl`/`gl`/`lr` wired in. Stops on CAPTCHA / consent / JavaScript wall; autocomplete keeps running. No CAPTCHA solving or evasion.
- CLI: `--serp`, `--serp-only`, `--serp-pages`, `--serp-sources`, `--serp-delay`, `--serp-backend`, `--serp-headful`, `--serp-chrome`, `--serp-profile`.
- Server: `/api/serp` (loopback-only, serialised, cached, cool-down), `--no-serp`, `--serp-gap`; `/api/health` reports SERP availability.
- Web app: "Google arama sayfalarını tara" card (1–100 pages, sources, delay) with live status and block notices.
- GitHub Action "Mine keywords": `serp_pages` input (default 0).
- Optional dependency `puppeteer-core` (uses your installed Chrome/Chromium/Edge). 45 tests incl. SERP HTML fixtures and fake-Google E2E.

## 1.0.0 — 2026-10-09

First public release.

- 25 engines (14 browser-direct), bulk seeds, locale-aware long-tail expansion, recursive mining,
  cross-engine de-duplication with agreement score, TXT/CSV/TSV/JSON/MD exports, TR/EN UI,
  local server + allow-listed proxy, Cloudflare Worker, CLI, GitHub Actions
  (Pages deploy, CI, "Mine keywords", weekly endpoint health).
- Search language & country (default `tr`/`tr`) wired into Google family, Bing, Yahoo (regional hosts),
  DuckDuckGo, Yandex (`lr`), Ecosia, Qwant, Swisscows, Brave, TikTok, Amazon (14 marketplaces), eBay, Wikipedia, Scholar.
- Pre-release audit fixes (see docs/AUDIT.md): CSP, proxy CORS allow-list and validation, Turkish question detection,
  `İ` normalisation, Baidu invalid-JSONP handling, hidden-field CSS bug, CLI validation, proxy self-throttling fix + 429 back-off, 33 tests.
