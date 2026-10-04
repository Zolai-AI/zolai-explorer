# Zolai Explorer

A **studio workbench** for the live [Zolai Core](https://github.com/Zolai-AI/zolai-core) API — a
React + Vite + TypeScript + TanStack Query app served on its own host at
**<https://studio.zolai.space/>**. It reads the API cross-origin at `https://api.zolai.space`
(`/explorer*` on that host 301-redirects here).

It is a workbench, not a set of bare JSON forms: every panel renders semantic cards, tables and
grids, collapses the sections the API has not populated yet, and labels the RAG placeholder answer
for what it is. The exact payload stays one click away in a collapsible **raw JSON** disclosure.

---

## Quick start

```bash
bun install
bun run dev        # http://localhost:5173/  (proxies /api + /health upstream)
```

| Script | What it does |
|--------|--------------|
| `bun run dev` | Vite dev server with `/api` + `/health` proxied to `https://api.zolai.space` |
| `bun run build` | `tsc -b` then `vite build` → `dist/` |
| `bun run typecheck` | Type check only (`tsc -b --force`) |
| `bun run test` | Vitest suite (58 tests) |
| `bun run deploy` | `vite build` + rsync to `pcore-server:/var/www/zolai-studio` + `nginx -t` + reload |

Requires **bun** (1.4.1+). Never npm/yarn — this is a workspace-wide convention.

## Environment

Copy `.env.example` to `.env.local` for local overrides. You do **not** need to set anything for the
app to run against the production API.

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | `/api/v1` | Versioned API surface. Relative by default, so the dev server (which proxies `/api` + `/health`) stays same-origin. |
| `ZOLAI_UPSTREAM` | `https://api.zolai.space` | Dev-proxy target only. |

Because the deployed studio is a **different origin** from the API, the production build pins an
absolute base in [`.env.production`](.env.production) (committed, no credential in it):

```
VITE_API_BASE=https://api.zolai.space/api/v1
```

That is what makes `HEALTH_URL` resolve to `https://api.zolai.space/health` — derived from the API
**origin**, never `API_BASE + '/health'` (`/api/v1/health` does not exist). `scripts/deploy.sh`
greps the built bundle for both invariants before shipping it.

## The API key

The app renders fully **without** a key: `/health` is public and the shell + dashboard load. When
the server is in `enforce` mode, most panels need a key.

- Enter it via the **API key** button in the top bar (or the amber **Set API key** prompt).
- It is stored in `localStorage` under `zolai.apiKey`.
- It is sent **only** as the `X-API-Key` request header to the Zolai Core API.
- It is never logged, never put in a URL or query string, never bundled, and **never committed**.
  `.env*` and `.gitignore` guard the repo; there is no key in any tracked file.
- `Clear` in the dialog wipes it from storage and clears the query cache.

`src/lib/key.ts` masks the stored value for display (`zl_l••••••3456`) and exposes an injectable
storage backend so the round-trip is unit tested without jsdom.

---

## Routes

| Route | Panel | Endpoints |
|-------|-------|-----------|
| `/` | Dashboard — collection tiles, health, knowledge version, quick jumps, external links | `/knowledge/statistics`, `/knowledge/version`, `/health` |
| `/word`, `/word/:word` | Word entry + 5 sub-resource tabs | `/word/{w}` and `/word/{w}/{forms,contexts,collocations,patterns,evidence}` |
| `/analyze` | Sentence tokenisation + paragraph segmentation | `/analyze/sentence`, `/analyze/paragraph` |
| `/search` | Lexical corpus search with per-source grouping | `/search` |
| `/rag` | Retrieval with honest placeholder labelling | `/rag` |
| `/data` | Full collection table, knowledge version, health | `/knowledge/statistics`, `/knowledge/version`, `/health` |
| `/links` | Endpoint reference, server-rendered links, known gaps | — |

`/word/pasian` and every other route deep-link and survive a browser refresh (SPA fallback:
`try_files $uri $uri/ /index.html`).

## Architecture

```
src/
  main.tsx                 entry: StrictMode + createRoot
  App.tsx                  QueryClientProvider + BrowserRouter(basename=import.meta.env.BASE_URL)
  index.css                Tailwind 4 import + design tokens
  lib/
    api.ts                 typed fetch: X-API-Key, 15s AbortController timeout,
                           ApiError{status,message,kind,needsKey}, empty-body tolerance
    key.ts                 localStorage store: get/set/clear/subscribe, masking, injectable backend
    schemas.ts             one tolerant zod schema per endpoint
    queryClient.ts         retry:1 (skipped for 4xx), staleTime 60s, no refetch on focus
    format.ts              number / uptime / timestamp / score formatters
  components/              AppShell, Sidebar, TopBar, KeyDialog, HealthPill, StatTile, Card,
                           Empty, ErrorState, Skeleton, RawJson, DataTable
  features/<area>/api.ts   one TanStack Query hook per endpoint
  routes/                  Dashboard, Word, Analyze, Search, Rag, Data, Links, NotFound
  lib/*.test.ts            vitest suites
```

### Design decisions

- **Tolerant zod schemas.** The live API already returns `[]` for `forms`, `grammar_usage`,
  `sentence_frequency: 0` and `morphology: {}`. Strict schemas would turn "not populated yet" into
  a hard error, so every array field has `.catch([])` and every record `.catch({})`. Test payloads
  are trimmed copies of the real responses, empty shapes included.
- **One error shape.** Every failure — HTTP, timeout, abort, network, malformed JSON — becomes an
  `ApiError` with a `kind`. `needsKey` is derived from `status === 401`, so the UI prompts for a
  key instead of printing a stack of text.
- **Empty is not broken.** `Empty` states explain *why* a section is empty ("not populated by the
  live API") and `sentence_frequency === 0` renders as `—`, not `0`.
- **No secrets in source.** The key is a browser-side concern held in `localStorage`; nothing in
  `src/` ever reads an environment variable for a credential.

## Honesty contract

The app is explicit about the deployment's real capabilities, so a panel is never mistaken for a bug:

- **`/rag` does not call a model.** Retrieval is real — `context` and `citations` come from the
  corpus — but `answer` is a template echo, because the server holds a placeholder
  `GEMINI_API_KEY`. The RAG panel carries a permanent amber notice and the answer is rendered in a
  panel titled *"Placeholder answer — not LLM-generated"*.
- **`/analyze/sentence` returns empty `pos`, `grammar` and `entities`.** Only tokens are rendered;
  the rest is a labelled placeholder with the server's own note.
- **`sentence_frequency` is always 0** → shown as `—`.
- **`morphology` and `forms` are usually empty** → collapsed with a pointer to the Forms tab.
- **`/api/v1/review/stats` is not registered** — it answers `200 {"error":"Not found"}`. The
  unversioned `/review/stats` 422s instead, because `/review/{item_id}` swallows `stats`. The Links
  panel links to the server-rendered `/review/` instead.
- **Auth is in `warn` mode** → unauthenticated requests are accepted today; the API may flip to
  `enforce`. Add a key to be ready.

The same list is rendered as cards on `/links` under "Known API gaps".

## Tests

```bash
bun run test
```

58 Vitest specs across three files:

- `src/lib/api.test.ts` — 401 → `ApiError` with `needsKey`; 15s timeout budget and abort →
  `timeout` / `aborted` distinction; transport failure → `network`; **empty body tolerated** instead
  of `JSON.parse('')`; malformed JSON → `parse`; FastAPI 422 envelope flattened to one line;
  `X-API-Key` header present only when a key is stored and never in the URL; **`/health` fetched
  verbatim, not as `/api/v1/health`** (regression guard for `apiGetAbsolute`) — both for the
  relative dev default and for the **absolute production base**, where
  `HEALTH_URL === 'https://api.zolai.space/health'` exactly.
- `src/lib/key.test.ts` — **key store round-trip** (set → get → clear), the `zolai.apiKey` storage
  key, whitespace trimming, blank-as-absent, subscribe/unsubscribe, masking that never reveals the
  middle of a key.
- `src/lib/schemas.test.ts` — every endpoint parsed from a **live-captured** payload, including the
  all-zero unknown-word response and the empty `pos`/`grammar`/`entities` sentence.

## Deploy

The SPA is served from disk by nginx on its **own host**, `studio.zolai.space`, so nothing in the
API vhost (`location /` → `127.0.0.1:8001`) can be affected by a deploy.

```
vite build  →  dist/                       # VITE_API_BASE from .env.production
rsync -az --delete dist/  →  pcore-server:/var/www/zolai-studio/
nginx -t && systemctl reload nginx         # safety check only — no config is edited
```

nginx (`/etc/nginx/sites-available/zolai-studio`, TLS server block, already installed):

```nginx
server_name studio.zolai.space;

root /var/www/zolai-studio;
index index.html;

location / { try_files $uri $uri/ /index.html; }            # SPA fallback
location /assets/ { add_header Cache-Control "public,max-age=31536000,immutable"; }
location = /index.html { add_header Cache-Control "no-cache"; }
```

The reference copy lives at
[`deploy/nginx/zolai-explorer.conf`](deploy/nginx/zolai-explorer.conf). `scripts/deploy.sh` never
edits it — it rsyncs the bundle, validates with `nginx -t`, and reloads. Its `--delete` is guarded:
the script aborts unless the remote directory ends in `/zolai-studio`.

On the API host, `/explorer*` 301-redirects to `https://studio.zolai.space/*` (prefix stripped), so
old links and bookmarks keep working. CORS on `api.zolai.space` allows `studio.zolai.space`.

## Stack

Verified latest stable at build time, pinned exactly:

`react@19.3.0` · `react-dom@19.3.0` · `vite@8.3.2` · `@vitejs/plugin-react@6.1.1` ·
`typescript@~5.9.3` (7.x is latest but the tooling lags, so 5.9 is pinned) · `tailwindcss@4.3.3` ·
`@tailwindcss/vite@4.3.3` · `@tanstack/react-query@5.104.1` · `react-router-dom@7.18.4` ·
`lucide-react@1.51.0` · `zod@4.6.5` · `vitest@5.0.3` (dev).

Tailwind 4 via the Vite plugin — no `tailwind.config.js`, no PostCSS. No UI kit: every component is
hand-rolled and lives in `src/components/`.

## Licence and credits

Part of the [Zolai-AI](https://github.com/Zolai-AI) workspace. Language ground truth is ZVS 2018:
SOV word order, ergative `in`, `kei` negation. See
[`AGENTS.md`](AGENTS.md) for the working rules for this repo.