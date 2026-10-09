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
| `bun run test` | Vitest suite (374 tests) |
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
| `/login` | Sign in — **not a nav item, but always discoverable** (top bar, sidebar footer, ⌘K). Two credential paths: **API key** — verify-then-store against `GET /api/v1/auth/me` (persist only when server recognises the key; 200 with no `key_prefix` = *rejected*). **Username + password** — `POST /api/v1/auth/login` returns a session token stored in `sessionStorage` as `zolai.session`, sent as `Authorization: Bearer`; on success the stored API key is **cleared** (one active credential). Sign-out calls `POST /api/v1/auth/logout` (best-effort) then clears the session. Both paths show verified identity from `/auth/me` — role, `key_prefix`, scopes, auth source — and a Sign out button. Failure modes stay distinct per path: **rejected** vs **unreachable** vs **rate_limited** — never a generic "login failed". Returns you to `?from=`, validated so it can only be a same-origin path | `GET /api/v1/auth/me`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` |
| `/word`, `/word/:word` | Word entry + 5 sub-resource tabs, each with a server-side `limit` | `/api/v1/word/{word}` and `/api/v1/word/{word}/{forms,contexts,collocations,patterns,evidence}` |
| `/analyze` | Sentence tokenisation + paragraph segmentation | `/api/v1/analyze/sentence`, `/api/v1/analyze/paragraph` |
| `/search` | Lexical corpus search with per-source grouping | `/api/v1/search` |
| `/rag` | Retrieval with honest placeholder labelling | `/api/v1/rag` |
| `/assistant` | Assistant chat — public route is honest `retrieval_only` when no provider is active; admin mode adds provider/model and the tool trace. Both modes carry a **provider/model selector** fed by `GET /api/v1/providers` (no hardcoded provider or model anywhere in `src/`); the answer shows the `provider · model` the server actually used, plus what was requested | `GET /api/v1/providers`, `POST /api/v1/assistant/chat`, `POST /api/v1/admin/assistant/chat` |
| `/agent` | Goal-driven research runs with phase trace and feedback (member+); the same provider/model selector sits above the goal input and travels in the run body | `GET /api/v1/providers`, `POST /api/v1/agent/runs`, `GET /api/v1/agent/runs/{run_id}`, `POST /api/v1/agent/runs/{run_id}/feedback` |
| `/data` | Collection table (zero-based `#`, bars from zero, `?collection=` filter), knowledge version, health | `/api/v1/knowledge/statistics`, `/api/v1/knowledge/version`, `/health` |
| `/links` | Endpoint reference, server-rendered links, known gaps | — (renders `src/lib/endpoints.ts`) |
| `/settings` | AI provider catalog, the admin API-keys panel **and** the admin users panel (all admin): providers — rename, model, enable, paste key, activate, test, refresh models; keys — list, issue, rotate, revoke; users — list, create, enable/disable, change role, change password, revoke sessions. A minted secret is shown **once** (issue dialog: cleared on close; rotate banner: explicit *Dismiss*) and is never cached; the users panel never sees a password or token, only the server's sanitized row | `GET/PUT /api/v1/admin/ai-providers`, `POST /api/v1/admin/ai-providers/{catalog_id}/activate`, `POST /api/v1/admin/ai-providers/{catalog_id}/test`, `POST /api/v1/admin/ai-providers/{catalog_id}/refresh-models`, `GET /api/v1/admin/api-keys`, `POST /api/v1/admin/api-keys`, `POST /api/v1/admin/api-keys/{key_id}/rotate`, `POST /api/v1/admin/api-keys/{key_id}/revoke`, `GET /api/v1/admin/users`, `POST /api/v1/admin/users`, `PUT /api/v1/admin/users/{username}`, `PUT /api/v1/admin/users/{username}/password`, `POST /api/v1/admin/users/{username}/revoke-sessions` |

`/login` is the only destination with `nav: false`: it must stay reachable **before** any privilege is
held, because the role prompt on `/agent` and `/settings` and the warn-mode banner all link to it as
the way out. Gate it and a user who cannot pass the gate can no longer acquire the key that opens it —
a chicken-and-egg trap. `routes.test.ts` asserts both halves of that: exactly one non-nav record, and
its `minRole` is `anonymous`.

`nav: false` also used to remove it from ⌘K, because the palette read the sidebar's list — so the
destination existed and *nothing offered it*: "there is no admin login on Studio". The record now
carries a second flag, `palette: true`, and the two lists are independent: nav is where a destination
*sits*, `palette` is whether ⌘K offers it. Sign-in is therefore reachable from three surfaces for
**every** role — the top bar's primary control (`signInEntry`), the sidebar footer, which switches
between *Sign in* and *role + Sign out* (`signInFooterEntry`), and ⌘K. All of them are derived from
`src/lib/signIn.ts` + the registry record, so a surface that stops rendering the affordance fails
`routes.test.ts`.

`/word/pasian` and every other route deep-link and survive a browser refresh (SPA fallback:
`try_files $uri $uri/ /index.html`).

**One registry, four consumers.** `src/lib/routes.ts` holds every destination (path, label,
description, `minRole`, icon key, palette keywords, `nav` / `palette` flags). `App.tsx` renders its
`<Route>`s from the registry — `PAGES` is keyed by the derived `RoutePath`, so a route with no
component is a *compile* error — while `Sidebar.tsx` (`NAV_ROUTES`), `commands.ts` (⌘K,
`PALETTE_ROUTES`) and `<RequireRole>` read the same records.
`PARAM_VARIANTS` covers deep links with a path parameter (`/word/:word` → the `/word` panel).

In-app destinations are read from that registry too: `pathOf('settings')`, `collectionPath(label)`,
`signInPath(from)`, `wordPath(headword)` and the `DASHBOARD_PATH` / `LOGIN_PATH` constants. **No
component types a path literal** — `src/lib/routes.test.ts` scans `src/routes`, `src/components` and
`src/features` and fails on any `to=` / `to:` / `href=` / `navigate(` bound to a hand-written
`'/settings'`, so a renamed registry record cannot leave a link that renders and then 404s. The
router is covered too (its `PAGES` keys are checked against the registry, and the rest of the file
is scanned with that map set aside).

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
| POST | `/api/v1/auth/login` | public | — |
| POST | `/api/v1/auth/logout` | session (Bearer) | — |
| POST | `/api/v1/assistant/chat` | public | — |
| POST | `/api/v1/admin/assistant/chat` | `agent:run` + admin role | — |
| POST | `/api/v1/agent/runs` | `agent:run` | — |
| GET | `/api/v1/agent/runs/{run_id}` | `agent:read` | — |
| POST | `/api/v1/agent/runs/{run_id}/feedback` | `agent:run` | — |
| GET | `/api/v1/knowledge/statistics` | `dataset:read` | — |
| GET | `/api/v1/knowledge/version` | `dataset:read` | — |
| GET | `/api/v1/foundation/stats` | public (optional surface) | — |
| GET | `/api/v1/providers` | public | — |
| GET | `/api/v1/admin/ai-providers` | `settings:read` | — |
| PUT | `/api/v1/admin/ai-providers/{catalog_id}` | `settings:write` | — |
| POST | `/api/v1/admin/ai-providers/{catalog_id}/activate` | `settings:write` | — |
| POST | `/api/v1/admin/ai-providers/{catalog_id}/test` | `settings:write` | — |
| POST | `/api/v1/admin/ai-providers/{catalog_id}/refresh-models` | `settings:write` | — |
| GET | `/api/v1/admin/api-keys` | `apikey:manage` | — |
| POST | `/api/v1/admin/api-keys` | `apikey:manage` | — |
| POST | `/api/v1/admin/api-keys/{key_id}/rotate` | `apikey:manage` | — |
| POST | `/api/v1/admin/api-keys/{key_id}/revoke` | `apikey:manage` | — |
| GET | `/api/v1/admin/users` | `user:manage` + admin role | — |
| POST | `/api/v1/admin/users` | `user:manage` + admin role | — |
| PUT | `/api/v1/admin/users/{username}` | `user:manage` + admin role | — |
| PUT | `/api/v1/admin/users/{username}/password` | `user:manage` + admin role | — |
| POST | `/api/v1/admin/users/{username}/revoke-sessions` | `user:manage` + admin role | — |

There is **no** `page_size` anywhere in the API — `limit` is the only name, and it travels in the
query string on GET routes and in the JSON body on the POST search/RAG routes. `/health`, `/docs`,
`/metrics` and the server-rendered `/review/` live outside `/api/v1`. The review count is not
available on the versioned API — see the honesty contract below — so no review number is rendered
anywhere in this app.

## Limits (server-side, not client-side)

Each word sub-resource tab carries a **Rows per request** control. The value is sent as `limit`,
clamped to the route's documented bounds (`1–100` for forms/contexts/collocations/patterns,
`1–200` for evidence) and it is part of the query key, so changing it refetches from the API
instead of paging a list the client already holds.

These endpoints return **bare arrays with no server total**, so the footers are deliberately honest:

| What the user sees | Why |
|--------------------|-----|
| `showing 12 rows (limit 20)` | the limit that was requested, and how many rows came back |
| `That is exactly the limit — more rows may exist.` | shown whenever `N === L`, because the list may be truncated |
| `1–10 of 24 rows fetched` | the *client-side* page range, worded "fetched" so it cannot be read as a corpus total |

There is no page-size floor on a bar, no min/max bar scaling and no invented total: see the honesty
contract below.

**Two kinds of cap, one field.** `limitMax` in `src/lib/endpoints.ts` is the largest `limit` the
client will send, and it means two different things:

| Routes | `limitMax` is… | Why |
|--------|----------------|-----|
| `GET /word/*` sub-resources | the **server** cap (`Query(le=…)`) | A larger value 422s, so the client clamps to it. |
| `POST /search`, `POST /rag` | a deliberate **client** clamp | `SearchRequest.limit` and `RAGRequest.limit` are plain pydantic fields with **no** server bound (`zolai-core/zolai/api/rag_router.py`), so nothing rejects a huge page — the clamp stops the UI asking for one it cannot render. |

Do not describe the `/search` and `/rag` values as server-enforced limits; they are not.

## API keys (admin, on `/settings`)

`/settings` carries two admin panels, and both are role-gated writes that proxy a server permission.

**Providers** — `GET/PUT /api/v1/admin/ai-providers`, `POST …/{catalog_id}/activate`,
`POST …/{catalog_id}/test`. Secrets are write-only: the catalog row carries `ref_masked` +
`configured`, and a pasted value is never echoed back into state, a URL or a toast.

**Keys** — the API-key panel. `GET /api/v1/admin/api-keys` lists them (`apikey:manage`, strict),
`POST /api/v1/admin/api-keys` issues one, and `POST /api/v1/admin/api-keys/{key_id}/rotate` /
`…/revoke` act on one. Note what the server does on **rotate**: the old key is revoked in the same
request and a replacement is minted, so the row flips to `revoked` and the new secret is the only
copy that exists.

A minted plaintext secret comes back from exactly one response and is shown **once**:

| Minting path | Where it is shown | How it is dropped |
|--------------|-------------------|-------------------|
| `POST /admin/api-keys` (issue) | the issue dialog | the dialog clears it on close |
| `POST /admin/api-keys/{id}/rotate` | the row's inline banner | an explicit **Dismiss** button |

Neither path is a React Query mutation — they are plain async calls with local pending state — so a
secret cannot land in the mutation cache. The *stored* key is only ever rendered masked
(`zolai_sk_ab••••••`), and the first key is bootstrapped with the `zolai apikey` CLI, because
minting one needs an existing `apikey:manage` key.

## Data page: zero-based, bars from zero

`/data` (and the dashboard's collections table) show a `#` column that starts at **0** for the first
row on screen, and each bar is drawn from a **zero baseline**, scaled to the largest collection in the
table. The count and its share of the total rows (`84,490 · 8.5%`) are printed next to every bar, so
the bar never has to carry the number alone. A previous 1% floor is gone: a 0-row collection renders
an empty bar, not a sliver.

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
                           (agent, analyze, apikeys, assistant, data, rag, settings, word)
    session.ts              verify-then-store key sign-in (probe /auth/me, never invent a session)
  routes/                  Dashboard, Word, Analyze, Search, Rag, Assistant, Agent, Data,
                           Links, Login, Settings, NotFound
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
- **`/word/{w}/forms` and `morphology` are usually empty** → the panels collapse to a *Not
  populated* note that names the endpoint, so an empty list is never read as a failed request.
- **Auth is in `warn` mode** → unauthenticated requests are accepted today; the API may flip to
  `enforce`. The shell therefore renders a persistent banner (sourced from `GET /auth/me`'s `mode`)
  reading *"Authentication: warn mode"* with a **Sign in…** CTA. It never claims a key is required
  today — that would be a false warning — and it disappears once the mode changes.

The same list is rendered as cards on `/links` under "Known API gaps".

## Tests

```bash
bun run test
```

374 Vitest specs across twenty-one files:

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
  map, the alignment map, and the honest footers: `pageRange` counts *fetched* rows,
  `resolvePageSize` refuses an unlisted choice, and `rowsSummary` warns exactly when the fetched count
  equals the server limit.
- `src/lib/auth.test.ts` — `rankOf` / `can` / `roleBadge`, the tolerant `AuthMeSchema`, and the
  command palette's role filter.
- `src/features/agent/api.test.ts` — run timeout budget and the `POST /agent/runs`,
  `GET /agent/runs/{id}` and feedback transports (method, path, body).
- `src/features/assistant/api.test.ts` — `assistantChatPath` public/admin routing and the
  `postAssistantChat` transport.
- `src/features/settings/api.test.ts` — the `/admin/ai-providers` catalog transports (list, PUT,
  activate, test).
- `src/lib/endpoints.test.ts` — **single source of truth guards**: unique records, templates with
  balanced `{param}` placeholders, `endpointPath` encoding + throwing on a missing parameter, limit
  clamping per route (100 vs the evidence cap of 200), *no path literal outside the registry*,
  *every record used*, and README/API-surface sync.
- `src/lib/signIn.test.ts` — **discoverability**: the sign-in registry record is non-nav *and*
  anonymous, `signInSurfaces` claims the top bar + sidebar + ⌘K for every role (and claims nothing for
  a missing or privilege-gated record), the palette holds `nav-login` for anonymous *and* admin, the
  top-bar control reads `Sign in` while anonymous and the role + server prefix once identified, the
  sidebar footer switches `sign-in` → `sign-out` (`to: null`, so a sign-out cannot 404), and
  `identitySummary` stays silent with no key, reports role/prefix/scopes after sign-in, and **warns**
  rather than claims success when a stored key is unrecognised. Plus the registry-flag mutation probe:
  flipping `palette` changes `inPalette`, `signInSurfaces` and `routeCommandsFor` membership.
- `src/lib/session.test.ts` — sign-in is verify-then-store: the candidate key goes out in the
  header only and never the URL, a 200 + no `key_prefix` is a **rejected** key, a 401 is rejected
  while a transport failure is *unreachable*, a blank paste never reaches the network, a rejected key
  stores nothing and leaves an existing key intact, and sign-out clears key + cache. Plus the
  **failure-mode mapping**: `verifyFailureMessage` / `verifyFailureNotice` name each mode
  (*nothing was sent* / *does not recognise* / *could not reach*), keep **key rejected** and **API
  unreachable** distinct (the latter blames transport — CORS, bot challenge — and never calls the key
  bad), and contain no generic "login failed".
- `src/features/apikeys/api.test.ts` — the `/admin/api-keys` transports (list, create, rotate,
  revoke) with method/path/body, tolerant parsing, honest 404/422 messages, and `isActiveKey`.
- `src/lib/charts.test.ts` — the zero-based bar maths: width is `value / largest` (a 1-row and a
  99-row collection stay 1% and 99%, never min/max scaled), a zero value is an empty bar rather than
  a floor, never above 100% or below zero, share-of-total guarded against a zero total, and the
  zero-based row index label.
- `src/features/word/api.test.ts` — the sub-resource `limit` contract: choices per tab (100 vs the
  evidence cap of 200), each route's documented default, the registry endpoint behind every tab, and
  `coerceWordLimit` clamping an over-large or hostile value instead of letting the API 422.
- `src/features/providers/api.test.ts` — the public catalog transport (`GET /providers`, no body,
  no key, five-field rows with no `secret`/`enabled`/`is_active`), the admin
  `POST /admin/ai-providers/{id}/refresh-models` transport (empty body, honest `source` of
  `remote` vs `catalog`, 403 surfaced), and the **selector defaults**: `defaultSelection` takes the
  first server row with its `selected_model`, falls back to its first published model, keeps a
  provider with no models rather than inventing one, and yields an empty selection (so the server
  keeps its own default) for an empty catalog; `modelsFor` lists only the chosen provider's models.
- `src/features/users/api.test.ts` — the `/admin/users` transports (list, create, update, password,
  revoke-sessions) with method/path/body, trimming on create, optional `display_name`/`role` omitted
  when blank, numeric `enabled` normalised to a boolean, no `password_hash` ever expected in a row,
  and honest `username_taken` / `user_not_found` / `invalid_input` messages.
- `src/lib/providerLiterals.test.ts` — the **no-hardcoded-target guard**: every non-test file under
  `src/` is scanned for provider ids and model ids (`pcore-brain`, `opencode/`, `gpt-*`, `claude-*`,
  `gemini-*`, …), and `ProviderModelSelect` must stay fed by `useProviderCatalog()` +
  `defaultSelection(...)` so the selectors can never pin this UI to one deployment's catalog.
- `src/lib/routes.test.ts` — the route registry: unique ids/paths, every record labelled with a
  known icon + role, exactly one non-nav destination (sign-in, and it must be anonymous — the
  chicken-and-egg guard) which opts into ⌘K through the `palette` flag (no nav record may carry it),
  the palette exposing one command per palette route with the same path/role and exactly one extra
  (`nav-login`), deep-link resolution (`/word/:word` → `/word`), and the `?from=` / `?collection=` query
  builders. Plus the **path drift guard**: `pathOf` resolves every id to its own recorded path,
  `wordPath` encodes a hostile headword so it cannot escape its segment, `safeReturnPath` refuses an
  absolute, protocol-relative or control-character `?from=` (no open redirect, no `pushState` throw),
  and a scan of `src/routes` + `src/components` + `src/features` (plus `App.tsx`, with its
  registry-keyed `PAGES` map set aside and checked against the registry) fails on any `to=` /
  `to:` / `href=` / `navigate(` bound to a hand-typed internal path. Plus the **surface guard**:
  `TopBar.tsx`, `Sidebar.tsx`, `CommandPalette.tsx` and `commands.ts` are read as source and must
  render the registry sign-in control (`signInEntry` / `signInFooterEntry` / `signInSurfaces` /
  `signInPath`), derive it from `specOf('login')` rather than `can()`, build ⌘K from
  `PALETTE_ROUTES` (never `NAV_ROUTES`), and give every palette command an icon — the checks that
  would have caught "there is no admin login on Studio".

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