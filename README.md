# Zolai Explorer

A **studio workbench** for the live [Zolai Core](https://github.com/Zolai-AI/zolai-core) API — a
React + Vite + TypeScript + shadcn/ui + TanStack Query app served on its own host at
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
| `bun run test` | Vitest suite (142 tests) |
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
| `/` | Dashboard — collection tiles, health, knowledge version, quick jumps, external links | `/api/v1/knowledge/statistics`, `/api/v1/knowledge/version`, `/api/v1/auth/me`, `/health` |
| `/word`, `/word/:word` | Word entry + 5 sub-resource tabs, each with a server-side `limit` | `/api/v1/word/{word}` and `/api/v1/word/{word}/{forms,contexts,collocations,patterns,evidence}` |
| `/analyze` | Sentence tokenisation + paragraph segmentation | `/api/v1/analyze/sentence`, `/api/v1/analyze/paragraph` |
| `/search` | Lexical corpus search with per-source grouping | `/api/v1/search` |
| `/rag` | Retrieval with honest placeholder labelling | `/api/v1/rag` |
| `/assistant` | Assistant chat — public route is honest `retrieval_only` when no provider is active; admin mode adds provider/model and the tool trace | `POST /api/v1/assistant/chat`, `POST /api/v1/admin/assistant/chat` |
| `/agent` | Goal-driven research runs with phase trace and feedback (member+) | `POST /api/v1/agent/runs`, `GET /api/v1/agent/runs/{run_id}`, `POST /api/v1/agent/runs/{run_id}/feedback` |
| `/data` | Full collection table, knowledge version, health | `/api/v1/knowledge/statistics`, `/api/v1/knowledge/version`, `/health` |
| `/links` | Endpoint reference, server-rendered links, known gaps | — (renders `src/lib/endpoints.ts`) |
| `/settings` | AI provider catalog (admin): rename, model, enable, paste key, activate, test | `GET/PUT /api/v1/admin/ai-providers`, `POST /api/v1/admin/ai-providers/{catalog_id}/activate`, `POST /api/v1/admin/ai-providers/{catalog_id}/test` |

`/word/pasian` and every other route deep-link and survive a browser refresh (SPA fallback:
`try_files $uri $uri/ /index.html`).

## API surface (one registry, one table)

`src/lib/endpoints.ts` is the single source of truth for every endpoint this app calls: it holds the
method, path template, required scope, `limit` placement/cap and an honest note per route. Transports
build their URLs with `endpointPath(id)` / `queryLimitPath(id, params, limit)` — **no transport
writes a path literal** — and `/links` plus the table below are rendered from the same records.
`src/lib/endpoints.test.ts` fails the build if a literal reappears elsewhere, if a record is never
used, or if this table drifts.

| Method | Path | Scope | `limit` |
|--------|------|-------|---------|
| GET | `/api/v1/auth/me` | public | — |
| GET | `/api/v1/word/{word}` | `dataset:read` | — |
| GET | `/api/v1/word/{word}/forms` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/contexts` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/collocations` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/patterns` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/evidence` | `dataset:read` | query, 1–200 (default 50) |
| POST | `/api/v1/analyze/sentence` | `rag:read` | — |
| POST | `/api/v1/analyze/paragraph` | `rag:read` | — |
| POST | `/api/v1/search` | `dataset:read` | body |
| POST | `/api/v1/rag` | `rag:read` | body |
| POST | `/api/v1/assistant/chat` | public | — |
| POST | `/api/v1/admin/assistant/chat` | `agent:run` + admin role | — |
| POST | `/api/v1/agent/runs` | `agent:run` | — |
| GET | `/api/v1/agent/runs/{run_id}` | `agent:read` | — |
| POST | `/api/v1/agent/runs/{run_id}/feedback` | `agent:run` | — |
| GET | `/api/v1/knowledge/statistics` | `dataset:read` | — |
| GET | `/api/v1/knowledge/version` | `dataset:read` | — |
| GET | `/api/v1/foundation/stats` | public (optional surface) | — |
| GET | `/api/v1/admin/ai-providers` | `settings:read` | — |
| PUT | `/api/v1/admin/ai-providers/{catalog_id}` | `settings:write` | — |
| POST | `/api/v1/admin/ai-providers/{catalog_id}/activate` | `settings:write` | — |
| POST | `/api/v1/admin/ai-providers/{catalog_id}/test` | `settings:write` | — |

There is **no** `page_size` anywhere in the API — `limit` is the only name, and it travels in the
query string on GET routes and in the JSON body on the POST search/RAG routes. `/health`, `/docs`,
`/metrics` and the server-rendered `/review/` live outside `/api/v1`. The review count is not
available on the versioned API — see the honesty contract below — so no review number is rendered
anywhere in this app.

## Architecture

```
src/
  main.tsx                 entry: StrictMode + createRoot
  App.tsx                  QueryClientProvider + TooltipProvider + BrowserRouter
                           (basename=import.meta.env.BASE_URL) + <Toaster>
  index.css                Tailwind 4 + shadcn token layer (:root light / .dark dark)
  lib/
    api.ts                 typed fetch: X-API-Key, 15s AbortController timeout,
                           ApiError{status,message,kind,needsKey}, empty-body tolerance
    endpoints.ts           THE endpoint registry: method, template, scope, limit, note +
                           endpointPath/queryLimitPath builders + the API-gap copy
    key.ts                 localStorage store: get/set/clear/subscribe, masking, injectable backend
    schemas.ts             one tolerant zod schema per endpoint
    queryClient.ts         retry:1 (skipped for 4xx), staleTime 60s, no refetch on focus
    format.ts              number / uptime / timestamp / score formatters
    auth.ts                GET /auth/me → useRole() + rankOf/can/roleBadge — the one
                           source of truth for role gating (sidebar, routes, palette)
    theme.ts               pure light/dark resolution + persistence (unit tested)
    useTheme.ts            useThemePreference / useResolvedTheme (React bindings for theme.ts)
    datatable.ts           sort comparator, breakpoint-hiding map, alignment map (unit tested)
  components/              AppShell, Sidebar, TopBar, KeyDialog, CommandPalette, HealthPill,
                           StatTile, Card, Empty, ErrorState, Skeleton, RawJson, DataTable,
                           ThemeToggle, ChartPanel, Charts, CollocationChart
  components/ui/           shadcn/ui (vendored — see below)
  features/<area>/api.ts   one TanStack Query hook per endpoint
                           (agent, analyze, assistant, data, rag, settings, word)
  routes/                  Dashboard, Word, Analyze, Search, Rag, Assistant, Agent, Data,
                           Links, Settings, NotFound
  lib/*.test.ts            vitest suites
```

### UI layer — shadcn/ui

`components.json` is committed and the `ui/` folder is **vendored shadcn code**, not a dependency
you import: the CLI copies the files in, you own them afterwards. Re-run the CLI the canonical way
when adding a primitive:

```bash
bunx shadcn@latest add -y -o <component>     # or `init` to re-apply config
```

Installed: `button` `card` `table` `input` `textarea` `dialog` `alert-dialog` `badge` `tabs`
`skeleton` `separator` `select` `dropdown-menu` `tooltip` `sheet` `scroll-area` `alert` `label`
`sonner`.

Three registry files needed small local edits, all documented in place:

- `ui/table.tsx` — added an optional `containerClassName` so `DataTable` can put shadcn's
  `scroll-fade-x` affordance on the element that actually scrolls.
- `ui/{dialog,sheet,select,dropdown-menu}.tsx` — `IconPlaceholder` (a shadcn-"create"-app import
  that does not exist here) resolved to the lucide icons it names.
- `ui/sonner.tsx` — wired to `src/lib/theme.ts` instead of `next-themes`.

### Theme

Class-based `.dark` on `<html>`, three preferences — `system | light | dark` — persisted under
`zolai.theme`.

- **No flash.** `index.html` runs a small *blocking* script in `<head>` that resolves the
  preference and sets the class, `style.colorScheme` and `<meta name="color-scheme">` before first
  paint. `src/lib/theme.test.ts` asserts the script is present, comes before the module entrypoint,
  and encodes the same rules as `src/lib/theme.ts`.
- The TopBar switch shows sun/moon for the resolved theme and names the three choices in the menu.
- `system` follows `prefers-color-scheme` live via `matchMedia`.
- Only `--primary*` / `--ring*` are customised (emerald, the previous brand accent); the rest is the
  stock neutral shadcn token set, so light and dark both ship in one CSS file.

### Responsive strategy

Authored mobile-first — base classes are the small-screen layout and `sm:` / `md:` / `lg:` scale up.

| Concern | Approach |
|---------|----------|
| Navigation | `<Sheet>` drawer with a hamburger below `lg`; persistent 15rem sidebar from `lg` |
| Grids | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |
| Forms | stacked fields, `sm:grid-cols-[1fr_auto_auto]` side by side |
| Tables | per-column `hideBelow` priority (`hidden md:table-cell`) plus a scrolling container with `scroll-fade-x`, so 375px shows the priority columns and never breaks the page |
| Touch | `max-lg:h-10` (40px) / `max-lg:h-11` on interactive controls below `lg` |
| Word sub-resources | shadcn `<Tabs>` with a horizontally scrollable `<TabsList>` |

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
- **`/review/stats` is not available on the versioned API.** `/api/v1/review/stats` answers
  `200 {"error":"Not found"}`, and the unversioned `/review/stats` 422s because `/review/{item_id}`
  swallows `stats`. No review count is rendered anywhere as if it were real; `/links` links to the
  server-rendered `/review/` queue instead and labels it.
- **Auth is in `warn` mode** → unauthenticated requests are accepted today; the API may flip to
  `enforce`. Add a key to be ready.

The same list is rendered as cards on `/links` under "Known API gaps".

## Tests

```bash
bun run test
```

142 Vitest specs across nine files:

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
- `src/lib/theme.test.ts` — preference parsing (only `system|light|dark`, corrupt values fall back),
  `system` collapsing against `prefers-color-scheme`, the `system → light → dark` cycle, the
  `localStorage` round-trip plus recovery from a throwing/blocked store, `.dark` + `colorScheme` +
  `<meta>` application, and the **no-flash guard on `index.html`**.
- `src/lib/datatable.test.ts` — the table sort comparator (numeric, locale-aware, natural ordering,
  nullish/NaN last), the TanStack `sortFn` built from it, the `hideBelow` → `hidden md:table-cell`
  map and the alignment map.
- `src/lib/auth.test.ts` — `rankOf` / `can` / `roleBadge`, the tolerant `AuthMeSchema`, and the
  command palette's role filter.
- `src/features/agent/api.test.ts` — run timeout budget and the `POST /agent/runs`,
  `GET /agent/runs/{id}` and feedback transports (method, path, body).
- `src/features/assistant/api.test.ts` — `assistantChatPath` public/admin routing and the
  `postAssistantChat` transport.
- `src/features/settings/api.test.ts` — the `/admin/ai-providers` catalog transports (list, PUT,
  activate, test).

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
`@tailwindcss/vite@4.3.3` · `@tanstack/react-query@5.104.1` · `@tanstack/react-table@9.2.4` ·
`react-router-dom@7.18.4` · `lucide-react@1.51.0` · `zod@4.6.5` · `vitest@5.0.3` (dev).

UI: `shadcn@4.21.1` (CLI + the `shadcn/tailwind.css` utilities), `radix-ui@1.6.7`,
`class-variance-authority@0.7.1`, `cn@0.4.0`, `sonner@2.0.8`, `tw-animate-css@1.4.0`,
`@fontsource-variable/geist@5.3.0`.

Tailwind 4 via the Vite plugin — no `tailwind.config.js`, no PostCSS. The token layer is Tailwind v4
CSS-first (`@theme inline` + `@custom-variant dark`), not a JS config.

## Licence and credits

Part of the [Zolai-AI](https://github.com/Zolai-AI) workspace. Language ground truth is ZVS 2018:
SOV word order, ergative `in`, `kei` negation. See
[`AGENTS.md`](AGENTS.md) for the working rules for this repo.