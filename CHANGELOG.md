# Changelog

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
