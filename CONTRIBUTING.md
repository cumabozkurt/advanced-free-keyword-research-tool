# Contributing / Katkıda bulunma

Thanks for helping! Türkçe veya İngilizce issue/PR açabilirsiniz.

## Setup

No dependencies. Node 18+.

```bash
npm test          # unit tests
npm run check     # live endpoint health check
npm start         # http://localhost:8787 (app + proxy)
```

## Adding or fixing an engine

1. Find a public suggestion endpoint (SearXNG's `searx/autocomplete.py` is a great reference).
2. Add an object to `ENGINES` in `web/js/engines.js`:
   ```js
   {
     id: 'example', name: 'Example', category: 'web', backend: 'Example',
     jsonp: { url: (q, o) => `https://…&q=${enc(q)}`, param: 'callback', parse: openSearch }, // only if it works in Chrome
     cors:  { url: (q, o) => `https://…`, parse },   // only if Chrome gets Access-Control-Allow-Origin
     http:  { url: (q, o) => `https://…`, parse },   // always
   }
   ```
3. **Verify in a real browser**, not just curl. Some servers send CORS headers to curl but not to Chrome, and Chrome blocks
   JSONP served as `application/json` or with `content-disposition: attachment` (ORB). If unsure, ship `http` only (proxy).
4. Add a parser fixture to `test/engines.test.js`, document it in `docs/ENDPOINTS.md`, run `npm run check`.

## Rules

- Public, key-less endpoints only. No captcha solving, fingerprint spoofing or bot-protection bypass.
- Keep it dependency-free and build-free (`web/` must stay deployable as static files).
- UI strings go in both `tr` and `en` in `web/js/i18n.js`.
- Conventional-ish commit messages (`feat:`, `fix:`, `docs:`, `test:`, `ci:`).
