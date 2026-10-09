# Suggestion endpoints

Verified live on **2026-10-09** from a Linux server and from headless Chrome 
(the browser test matters: some endpoints answer `curl` fine but are blocked in real browsers).
Re-check any time with `npm run check` — a GitHub Action also runs it weekly.

Legend — **Browser**: how the static GitHub Pages app reaches the engine.
`jsonp` = `<script>` callback · `cors` = `fetch()` allowed by CORS headers · `proxy` = needs the local server / Cloudflare Worker.
The CLI, local server and GitHub Action always use plain HTTP, so **every** engine works there.

| Engine (id) | Browser | Endpoint (HTTP transport) | Response → suggestions | Notes |
|---|---|---|---|---|
| Google (`google`) | jsonp `callback` | `https://suggestqueries.google.com/complete/search?client=chrome&ie=utf-8&oe=utf-8&hl={hl}&gl={gl}&q={q}` | OpenSearch `[q, [s…]]` | Without `ie/oe=utf-8` Google answers in ISO-8859-x for some languages (mojibake). ~15 results with `client=chrome`. |
| YouTube (`youtube`) | jsonp | same + `ds=yt` | OpenSearch | |
| Google Images (`google-images`) | jsonp | same + `ds=i` | OpenSearch | |
| Google News (`google-news`) | jsonp | same + `ds=n` | OpenSearch | |
| Google Shopping (`google-shopping`) | jsonp | same + `ds=sh` | OpenSearch | Fewer results. |
| Google Scholar (`google-scholar`) | proxy | `https://scholar.google.com/scholar_complete?hl={hl}&q={q}` | `{l:[…]}` | |
| Bing (`bing`) | jsonp `JsonCallback` (+`JsonType=callback`) | `https://api.bing.com/osjson.aspx?market={hl}-{GL}&query={q}` | OpenSearch | Up to ~20 results. |
| Yahoo (`yahoo`) | jsonp `callback` | `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&nresults=10&command={q}` | `{r:[{k}]}` | Bing-backed. |
| DuckDuckGo (`duckduckgo`) | jsonp, **fixed** callback `autocompleteCallback` | `https://duckduckgo.com/ac/?kl={gl}-{hl}&q={q}` | `[{phrase}]` | Any other callback name returns plain JSON → requests are serialised in the browser. |
| Yandex (`yandex`) | proxy | `https://suggest.yandex.com/suggest-ff.cgi?uil={hl}&part={q}` | OpenSearch | JSONP (`suggest-ya.cgi?callback=`) exists but Chrome blocks it (ORB: `content-disposition: attachment` + `nosniff`). |
| Baidu (`baidu`) | jsonp `cb` (`suggestion.baidu.com/su?ie=utf-8`) | `https://www.baidu.com/sugrec?ie=utf-8&prod=pc&wd={q}` | `{g:[{q}]}` (JSONP: `{s:[…]}`) | JSONP body is a JS object (unquoted keys) → HTTP uses `sugrec` JSON. |
| 360 Search (`so360`) | jsonp `callback` | `https://sug.so.360.cn/suggest?encodein=utf-8&encodeout=utf-8&format=json&word={q}` | `{result:[{word}]}` | |
| Sogou (`sogou`) | proxy | `https://sor.html5.qq.com/api/getsug?key={q}` | `window.sogou.sug([q,[…]],-1)` | GBK encoded, fixed callback. |
| Quark / Shenma (`quark`) | proxy | `https://sugs.m.sm.cn/web?q={q}` | `{r:[{w}]}` | |
| Naver (`naver`) | jsonp `_callback` | `https://ac.search.naver.com/nx/ac?…&r_format=json&q={q}` | `{items:[[[s,…]]]}` | Korean queries only. |
| Seznam (`seznam`) | cors (origin reflected) | `https://suggest.seznam.cz/fulltext/cs?count=10&phrase={q}` | `{result:[{text:[{text}]}]}` | Czech. |
| Swisscows (`swisscows`) | proxy | `https://api.swisscows.com/suggest?locale={hl}-{GL}&query={q}` | `[s…]` | Sends `ACAO:*` to curl but not to real browsers. |
| Brave (`brave`) | proxy | `https://search.brave.com/api/suggest?rich=false&q={q}` | OpenSearch | ⚠ experimental: often HTTP 429 for non-browser clients. CORS only for `brave.com`. |
| Ecosia (`ecosia`) | proxy | `https://ac.ecosia.org/?type=list&q={q}` | OpenSearch | Bing/Google backed. |
| Qwant (`qwant`) | proxy | `https://api.qwant.com/v3/suggest?locale={hl}_{GL}&q={q}` | `{data:{items:[{value}]}}` | Bing backed. |
| Amazon (`amazon`) | proxy | `https://completion.{amazon-domain}/api/2017/suggestions?mid={marketplace}&alias=aps&prefix={q}` | `{suggestions:[{value}]}` | 14 marketplaces mapped by country (`us, gb, de, fr, it, es, tr, jp, ca, in, br, mx, au, nl`). Old `/search/complete` + JSONP is **dead (404)**. |
| eBay (`ebay`) | cors (`ACAO:*`) | `https://autosug.ebaystatic.com/autosug?_jgr=1&sId={site}&kwd={q}` | `/**/fn({res:{sug:[…]}})` | `callback=` works but is served as `application/json` → blocked as script; CORS works. |
| Walmart (`walmart`) | proxy | `https://www.walmart.com/typeahead/v3/complete?term={q}` | `{queries:[{displayName}]}` | US. |
| Wikipedia (`wikipedia`) | cors (`origin=*`) | `https://{hl}.wikipedia.org/w/api.php?action=opensearch&search={q}` | OpenSearch | Article titles — useful for entities. |
| TikTok (`tiktok`) | proxy | `https://www.tiktok.com/api/search/general/sug/?aid=1988&keyword={q}` | `{sug_list:[{content}]}` | ⚠ experimental, undocumented. |

## Tested and **not** usable (2026-10-09)

| Engine | Endpoint tried | Result |
|---|---|---|
| Google Books | `suggestqueries…&ds=bo` | Always empty |
| Google Play | `market.android.com/suggest/SuggRequest` (used by keywordshitter2) | 404 — dead |
| Amazon (old) | `completion.amazon.*/search/complete?method=completion` (keywordshitter2) | 404 — dead |
| Twitter/X | `twitter.com/i/search/typeahead.json` (keywordshitter2) | Requires login |
| Ask.com | `ss.ask.com/query` | No response |
| Startpage | `startpage.com/suggestions` | 204 empty |
| Mojeek | `/autocomplete`, `/suggest` | 404 |
| Yep | `api.yep.com/ac` | 403 (bot protection) |
| Pinterest | `AdvancedTypeaheadResource` | 403 |
| Etsy | `suggestions_ajax.php` | 403 (DataDome) |
| Yahoo Japan | `assist-search.yahooapis.jp` | 403 (needs app id) |
| Daum | `suggest.search.daum.net` | Empty |
| Dogpile | `/suggestions` | Empty |
| App Store | `search.itunes.apple.com/…/hints` | Empty plist |

Bypassing bot protection (403 / DataDome / captchas) is intentionally **out of scope**.
