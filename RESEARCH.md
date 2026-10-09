# Research notes

Research done on **2026-10-09** before building Advanced Free Keyword Research Tool.
Goal: understand keywordshitter2, survey similar open-source tools, and find which public
suggestion endpoints still work — from a server *and* from a real browser.

## 1. keywordshitter2 (the tool we replace)

Repo: <https://github.com/wassname/keywordshitter2> · ~222★ · MIT · jQuery + lodash + Bootstrap + DataTables.

How it works (`public/js/suggestions.js`, `public/js/main.js`):

- One seed keyword → queue. Each queue item is sent to **one** selected service via jQuery JSONP (`callback=?`).
- Each result is appended to a table; then **permutations** are queued: every result gets
  prefixes (`a…z`, `how, which, why, where, who, when, are, what`) and suffixes
  (`a…z`, `like, for, without, with, versus, vs, to, near, except, has`). The queue grows practically forever.
- Fixed `rateLimit: 750 ms`, positive/negative filters, local cache.
- Services hard-coded: Google (+news, shopping, books, YouTube, videos, images), Yahoo, Bing, eBay, Amazon UK,
  Twitter, Baidu, Yandex, Google Play (apps, movies, books).

Status in 2026 (tested):

| keywordshitter2 service | Status |
|---|---|
| Google family via `suggestqueries` JSONP | ✅ still works (we use `client=chrome&ie=utf-8&oe=utf-8`) |
| Bing `osjson.aspx` JSONP | ✅ works |
| Yahoo `sugg/ff?output=jsonp` | ✅ works (we use the newer `gossip-us-ura` endpoint) |
| Baidu `su?cb=` | ✅ works (needs `ie=utf-8`, otherwise GBK) |
| eBay `autosug.ebay.com` JSONP | ⚠ response served as `application/json` → **blocked by modern Chrome** as a script. CORS works instead. |
| Yandex `suggest-ya.cgi` JSONP | ⚠ **blocked by Chrome ORB** (`content-disposition: attachment`). Needs a proxy. |
| Amazon `completion.amazon.co.uk/search/complete` | ❌ 404 (replaced by `/api/2017/suggestions`, no CORS) |
| Google Play `market.android.com/suggest` | ❌ 404 |
| Twitter typeahead | ❌ login required |
| Google Books `ds=bo` | ❌ always empty |

Weaknesses we fix:

1. **One engine per run**, no cross-engine merge → we query many engines in parallel and merge into one de-duplicated set with an `engines` column (a keyword suggested by 6 engines is a strong signal).
2. **No bulk input** → textarea + `.txt/.csv` upload + CLI file/stdin.
3. **Unbounded queue**, single global delay → per-engine queues, per-engine delay, global concurrency, max requests per engine, max results, depth control, pause/resume/stop, auto-disable of failing engines.
4. Several dead endpoints, jQuery JSONP that modern browsers block → every endpoint re-verified in headless Chrome; a tiny allow-listed proxy for the rest.
5. Only English permutations → locale-aware alphabets (Turkish `ç ğ ı ö ş ü`, German, Spanish, Russian…), localized question words and modifiers.
6. No CLI / automation → zero-dependency Node CLI, local server, Cloudflare Worker, and a **GitHub Action that runs research on GitHub itself**.
7. Exports limited to table copy/CSV → TXT, CSV (UTF-8 BOM, formula-injection safe), TSV, JSON, Markdown, clipboard.
8. jQuery/Bootstrap 3/Less build → no build step, no runtime dependencies, ES modules shared by browser and Node.

## 2. Similar open-source tools

Surveyed ~45 repositories via GitHub search (`keyword suggestion autocomplete`, `google autocomplete scraper`,
`keyword research tool`, `keyword shitter`, `google suggest`, `long tail keyword`, …) plus well-known hosted tools.
Stars as of 2026-10-09.

| Project | ★ | Stack | What it does well | Limitations |
|---|---|---|---|---|
| [searxng/searxng](https://github.com/searxng/searxng) (`searx/autocomplete.py`) | 38k | Python | Best maintained catalogue of autocomplete backends (Google, Bing, Brave, DDG, Qwant, Seznam, Startpage, Swisscows, Yandex, Baidu, 360, Sogou, Quark, Naver, Wikipedia…) | Not a keyword tool: one backend at a time, no expansion/export |
| [respectlytics/respectaso](https://github.com/respectlytics/respectaso) | 517 | Python/macOS | Private ASO keyword research, no API keys | App Store only, macOS only |
| [wassname/keywordshitter2](https://github.com/wassname/keywordshitter2) | 222 | jQuery | Simple, browser-only, prefix/suffix permutations | See §1 |
| [rdowns26/seo_keyword_research_tools](https://github.com/rdowns26/seo_keyword_research_tools) | 166 | Python | Search volume via Google Ads API | Needs paid API credentials, legacy API |
| [chukhraiartur/seo-keyword-research-tool](https://github.com/chukhraiartur/seo-keyword-research-tool) | 165 | Python | Autocomplete + People Also Ask + Related Searches | Requires SerpApi key (paid); Google only |
| [arunkumar9t2/rxSuggestions](https://github.com/arunkumar9t2/rxSuggestions) | 93 | Java | Reactive Google Suggest library | Library, Google only |
| [boringmarketer/keyword-research-tool](https://github.com/boringmarketer/keyword-research-tool) | 78 | JS | Web UI | Depends on third-party APIs |
| [nicolaischneider/app-store-kw-rv-eng](https://github.com/nicolaischneider/app-store-kw-rv-eng) | 79 | JS | AI-generated ASO keywords | App Store only, needs AI key |
| [hassancs91/Keyword-Research-tool-python](https://github.com/hassancs91/Keyword-Research-tool-python) | 36 | Python | Tutorial: Google autocomplete + alphabet | Google only, script |
| [eugeneware/suggestion](https://github.com/eugeneware/suggestion) | 32 | Node | npm lib, `a…z` iteration | Google only, unmaintained |
| [Leszek-Sieminski/googleSuggestQueriesR](https://github.com/Leszek-Sieminski/googleSuggestQueriesR) | 19 | R | R interface | Google only |
| [euclid1990/php-google-suggest](https://github.com/euclid1990/php-google-suggest), [buchin/google-suggest](https://github.com/buchin/google-suggest), [wildlyinaccurate/google-suggestqueries-api](https://github.com/wildlyinaccurate/google-suggestqueries-api) | 10–18 | PHP | Server libs | Google only |
| [datagrab/keyword-scraper](https://github.com/datagrab/keyword-scraper) | 12 | Node | Scrapes Google "related searches" | Scrapes SERP HTML (fragile, ToS-hostile) |
| [yangar/keywords-generator](https://github.com/yangar/keywords-generator) | 10 | jQuery | Client-side long-tail generator | Google only, CC-BY-SA |
| [lif3time-secr3t-c0de/Keyword-Explorer](https://github.com/lif3time-secr3t-c0de/Keyword-Explorer) | 4 | TS | Google/YouTube/Bing/Amazon | Small, needs backend |
| [iamtalhaasghar/keyword-shitter](https://github.com/iamtalhaasghar/keyword-shitter) | 3 | Python | Scrapes keywordshitter.com | Depends on a third-party site |
| Many `*/google-autocomplete-scraper` repos (2026) | 0–1 | — | — | Mostly SEO-spam READMEs promoting paid scraping APIs |

Hosted (closed) references: **keywordtool.io** (many engines, but results paywalled),
**AnswerThePublic** (question/preposition wheels, daily limits), **Soovle** (multi-engine live view, no export/bulk),
**Ubersuggest** (volume data, paid), the original **keywordshitter.com** (offline).

### Take-aways that shaped the design

- Nobody combines **many engines + bulk seeds + recursion + exports + zero setup**. Most FOSS tools are Google-only libraries.
- Multi-engine agreement (how many engines suggest the same phrase) is a free, useful relevance signal → `engines` / `engine_count` columns and default sort.
- AnswerThePublic-style **questions & prepositions** are valuable → `questions` and `modifiers` strategies, localized.
- Tools that need API keys or scrape SERP HTML don't last → we only use public autocomplete endpoints, document them, and health-check them weekly.
- SearXNG's list is the best upstream reference for new backends; check it when an endpoint breaks.

## 3. Endpoint findings

See **[docs/ENDPOINTS.md](docs/ENDPOINTS.md)** for every URL, transport, response format and the list of dead endpoints.

Key lessons:

- **Test in a real browser, not just curl.** Swisscows returns `Access-Control-Allow-Origin: *` to curl but not to Chrome; Yandex and eBay JSONP are blocked by Chrome's Opaque Response Blocking / strict MIME checks.
- **DuckDuckGo** only honours the callback name `autocompleteCallback`.
- **Google** needs `ie=utf-8&oe=utf-8` or it answers in legacy encodings for e.g. Turkish.
- **Sogou** answers GBK; Node's `TextDecoder('gbk')` handles it.
- **Amazon** autocomplete moved to `/api/2017/suggestions` and needs the marketplace id (`mid`).
- Several engines are re-skins of Bing (Yahoo, Ecosia, Qwant, Swisscows, DuckDuckGo partially) — useful for agreement scores, but not fully independent sources.

## 4. Responsible use

- Default delay 350–400 ms **per engine**, max 4 engines in parallel, 1 retry, auto-disable after 6 consecutive errors.
- The proxy is **not an open proxy**: only engine ids from the registry are accepted, upstream URLs are built server-side, queries are length-limited, per-IP rate-limited and cached.
- The CLI identifies itself with an honest User-Agent (`AdvancedFreeKeywordResearchTool/1.0 (+repo URL)`).
- No captcha solving, fingerprint spoofing or bot-protection bypass — engines that block automated clients are documented as unsupported.
