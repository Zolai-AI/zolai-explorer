# Zolai Explorer
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-blue.svg)

A **studio workbench** for the live [Zolai Core](https://github.com/Zolai-AI/zolai-core) API — a
React + Vite + TypeScript + shadcn/ui + TanStack Query app served on its own host at
**<https://studio.zolai.space/>**. It reads the API cross-origin at `https://api.zolai.space`
(`/explorer*` on that host 301-redirects here).

It is a workbench, not a set of bare JSON forms: every panel renders semantic cards, tables and
grids, collapses the sections the API has not populated yet, and labels whether a RAG answer was
model-written or served as evidence
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
| `bun run test` | Vitest suite (924 tests) |
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

- Enter it via the **API key** button in the top bar (or the amber **Set API key** prompt), or the
  key card on `/login`. Both go through `signIn`, which verifies against `GET /api/v1/auth/me`
  before anything is stored — an unverified paste is never saved.
- It is stored in `localStorage` under `zolai.apiKey`.
- It is sent **only** as the `X-API-Key` request header to the Zolai Core API — and only while no
  session is active. `src/lib/credentials.ts` is the single resolver: **session wins, else key, never
  both**, so saving a key ends a password session and signing in with a password clears the key.
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
| `/login` | Sign in — **not a nav item, but always discoverable** (top bar, sidebar footer, ⌘K). Two credential paths: **API key** — verify-then-store against `GET /api/v1/auth/me` (persist only when server recognises the key; 200 with no `key_prefix` = *rejected*). **Username + password** — `POST /api/v1/auth/login` returns a session token stored in `sessionStorage` as `zolai.session`, sent as `Authorization: Bearer`; on success the stored API key is **cleared** (one active credential), and key sign-in symmetrically **ends the session** — `credentials.ts` sends the session in preference to a key, so a key stored under a live session would never go out. Sign-out calls `POST /api/v1/auth/logout` (best-effort) then clears the session. Both paths show verified identity from `/auth/me` — role, `key_prefix` or username, scopes, auth source — and a Sign out button, each offered only for the credential it can actually end. Failure modes stay distinct per path: **rejected** vs **unreachable** vs **rate_limited** — never a generic "login failed". Returns you to `?from=`, validated so it can only be a same-origin path | `GET /api/v1/auth/me`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` |
| `/word`, `/word/:word` | Word entry + 6 sub-resource tabs, each with a server-side `limit`. The open tab and every limit live in the **URL** (`?tab=evidence`, `?limit_evidence=200`, written `replace` so tab clicks never enter the back stack), so a panel state pastes to a colleague and survives a reload; an out-of-range value is clamped to the endpoint's own cap and the difference is stated in a persistent notice, never applied silently | `/api/v1/word/{word}` and `/api/v1/word/{word}/{forms,contexts,collocations,patterns,evidence,related}` |
| `/analyze` | Sentence tokenisation + paragraph segmentation | `/api/v1/analyze/sentence`, `/api/v1/analyze/paragraph` |
| `/search` | Lexical corpus search with per-source grouping | `/api/v1/search` |
| `/rag` | Retrieval, citations, and a model-written answer labelled with its provenance | `/api/v1/rag` |
| `/assistant` | Assistant chat — public route is honest `retrieval_only` when no provider is active; admin mode adds provider/model and the tool trace. Both modes carry a **provider/model selector** fed by `GET /api/v1/providers` (no hardcoded provider or model anywhere in `src/`) and **no override is sent unless you choose one** — an empty selection leaves the server to pick its own target (`Use server default` clears it again); the answer shows the `provider · model` the server actually used, plus what was requested. A pasted own key travels as **`api_key` only** against the **selected** catalog row — the client never sends `user_provider` and never names a vendor, so the key control stays disabled until a provider is chosen | `GET /api/v1/providers`, `POST /api/v1/assistant/chat`, `POST /api/v1/admin/assistant/chat`, `POST /api/v1/assistant/feedback` |
| `/contribute` | Public contribution form for submitting dictionary additions, corrections, usage examples, and grammar notes. Submissions are queued for editorial review. **Open to anonymous, and needs no role** — the page says so, because "request a role" reads like the price of a suggestion otherwise. A resolved credential is recorded as `attributed_to` (the server's word, never a field this form sends), and a signed-in visitor gets a read-back of their own submissions and review state — a projection with **no `email`**, so the address offered for editorial contact never returns to a browser. | `POST /api/v1/contributions`, `GET /api/v1/contributions/mine` |
| `/requests` | Role requests — ask for `admin`/`superadmin`, and (for a superadmin) decide the asks. The route minimum is `member`, not the role that reads the queue: the ask has to be reachable by exactly the people who need it, so the queue is a section that gates itself on the server's reported role. Eligibility reads **both** `role` and `auth_source` — an API key or an OAuth token has a rank and no account, so it gets 403 `session_required` and the form says that instead of offering a submit button that can only fail. The select lists only ranks *above* the caller's own (`role_already_held` is a 409 the server states), the reason is bounded to the server's 10–1000 before it is spent against the 5/min ask budget, and a rejection cannot be a silent click (`note_required`). A decision is not a status update: approval goes through the one guarded role writer, and because the status flips only **after** that writer returns, a refusal leaves the row `pending` — the panel therefore re-reads the queue and quotes the server's sentence rather than guessing which guard answered. | `POST /api/v1/role-requests`, `GET /api/v1/role-requests/mine`, `GET /api/v1/role-requests`, `POST /api/v1/role-requests/{request_id}/decision` |
| `/agent` | Goal-driven research runs with phase trace and feedback (member+); the same provider/model selector sits above the goal input and travels in the run body | `GET /api/v1/providers`, `POST /api/v1/agent/runs`, `GET /api/v1/agent/runs/{run_id}`, `POST /api/v1/agent/runs/{run_id}/feedback` |
| `/orchestra` | Multi-agent learning system — registry counts and role histogram, one card per agent (skills, enabled state, confidence threshold), the skill catalog, a **run panel** for the six orchestrator tasks (translate, validate/correct grammar, learn Bible patterns, build vocabulary, extract collocations) that reports `limit_applied` / `limit_clamped` verbatim, and assistant assignments with admin bind/unbind. Reads are public; the enable/disable, threshold and assignment controls render only for a role the **server** reported, so a member sees a read-only roster instead of buttons that would 401 | `GET /api/v1/learning/overview`, `GET /api/v1/learning/agents`, `GET /api/v1/learning/skills`, `GET /api/v1/learning/assistants`, `GET /api/v1/learning/bindings`, `POST /api/v1/learning/run`, `PATCH /api/v1/learning/agents/{agent_id}`, `POST /api/v1/learning/agents/{agent_id}/enable`, `POST /api/v1/learning/agents/{agent_id}/disable`, `POST /api/v1/learning/bindings`, `DELETE /api/v1/learning/bindings/{assistant_id}/{agent_id}` |
| `/data` | Collection table (zero-based `#`, bars from zero) with the applied `?collection=` shown as a removable **filter chip** beside a non-interactive "Showing: N of M collections" count chip — the prose block and "Show all collections" link it replaced offered a way out that was never a filter, and the count has no setter so it renders as a fact, not a button; plus knowledge version and health | `/api/v1/knowledge/statistics`, `/api/v1/knowledge/version`, `/health` |
| `/review` | Correction queue + audit trail (member+). The view, the table and the filter are all in the **URL** — `?tab=audit`, `?table=phrases`, `?q=hpa` — through the same pure codecs as `/word` (defaults omitted, `replace` so a view change never enters the back stack, `table` validated against the whitelist, `q` free text trimmed on read), so "look at the pending phrases for hpa" is a link and not a description. **What the queue is showing sits in a chip row**: `View` when not browsing, `Table` (removable only off the default, because `records.list` requires the query so "Clear all" resets it rather than dropping it), `Filter`, and a non-interactive `Showing N rows` naming exactly the payload — the API returns bare arrays, so there is no total to print. Each Card subtitle states the request it made (`GET /records · limit 50 · page 2`). The **cursor stack is deliberately not in the URL**: it is a `WHERE id > ?` position over live data, so a pasted stack would show rows that no longer exist | `GET /api/v1/records`, `GET /api/v1/audit`, `PATCH /api/v1/review/records/{table}/{row_id}` |
| `/links` | Endpoint reference, server-rendered links, known gaps | — (renders `src/lib/endpoints.ts`) |
| `/settings` | AI provider catalog, the admin API-keys panel **and** the admin users panel (all admin): providers — rename, model, enable, paste key, activate, test, refresh models; keys — list, issue, rotate, revoke; users — list, create, enable/disable, change role, change password, revoke sessions. A minted secret is shown **once** (issue dialog: cleared on close; rotate banner: explicit *Dismiss*) and is never cached; the users panel never sees a password or token, only the server's sanitized row. Every users write that narrows access or drops live sessions goes through a confirm step that names the account and warns when the row is *your own* (**you** badge) or the **last enabled admin** — the two cases with no undo from this browser | `GET/PUT /api/v1/admin/ai-providers`, `POST /api/v1/admin/ai-providers/{catalog_id}/activate`, `POST /api/v1/admin/ai-providers/{catalog_id}/test`, `POST /api/v1/admin/ai-providers/{catalog_id}/refresh-models`, `GET /api/v1/admin/api-keys`, `POST /api/v1/admin/api-keys`, `POST /api/v1/admin/api-keys/{key_id}/rotate`, `POST /api/v1/admin/api-keys/{key_id}/revoke`, `GET /api/v1/admin/users`, `POST /api/v1/admin/users`, `PUT /api/v1/admin/users/{username}`, `PUT /api/v1/admin/users/{username}/password`, `POST /api/v1/admin/users/{username}/revoke-sessions` |

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
| GET | `/api/v1/auth/capabilities` | public | — |
| GET | `/api/v1/word/{word}` | `dataset:read` | — |
| GET | `/api/v1/word/{word}/forms` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/contexts` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/collocations` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/patterns` | `dataset:read` | query, 1–100 (default 20) |
| GET | `/api/v1/word/{word}/evidence` | `dataset:read` | query, 1–200 (default 50) |
| GET | `/api/v1/word/{word}/related` | `dataset:read` | query, 1–50 (default 12) |
| POST | `/api/v1/analyze/sentence` | `rag:read` | — |
| POST | `/api/v1/analyze/paragraph` | `rag:read` | — |
| POST | `/api/v1/search` | `dataset:read` | body |
| POST | `/api/v1/rag` | `rag:read` | body |
| POST | `/api/v1/auth/login` | public | — |
| POST | `/api/v1/auth/logout` | session (Bearer) | — |
| POST | `/api/v1/assistant/chat` | public | — |
| POST | `/api/v1/admin/assistant/chat` | `agent:run` + admin role | — |
| POST | `/api/v1/assistant/feedback` | public | — |
| POST | `/api/v1/contributions` | public | — |
| GET | `/api/v1/contributions/mine` | member role + session | query, 1–100 (default 20) |
| POST | `/api/v1/agent/runs` | `agent:run` | — |
| GET | `/api/v1/agent/runs/{run_id}` | `agent:read` | — |
| POST | `/api/v1/agent/runs/{run_id}/feedback` | `agent:run` | — |
| GET | `/api/v1/learning/overview` | public | — |
| GET | `/api/v1/learning/agents` | public | — |
| GET | `/api/v1/learning/skills` | public | — |
| GET | `/api/v1/learning/assistants` | public | — |
| GET | `/api/v1/learning/bindings` | public | — |
| POST | `/api/v1/learning/run` | public | body |
| PATCH | `/api/v1/learning/agents/{agent_id}` | admin role | — |
| POST | `/api/v1/learning/agents/{agent_id}/enable` | admin role | — |
| POST | `/api/v1/learning/agents/{agent_id}/disable` | admin role | — |
| POST | `/api/v1/learning/bindings` | admin role | — |
| DELETE | `/api/v1/learning/bindings/{assistant_id}/{agent_id}` | admin role | — |
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
| POST | `/api/v1/role-requests` | member role + session | — |
| GET | `/api/v1/role-requests/mine` | member role + session | query, 1–100 (default 20) |
| GET | `/api/v1/role-requests` | `role:manage` + superadmin | query, 1–200 (default 50) |
| POST | `/api/v1/role-requests/{request_id}/decision` | `role:manage` + superadmin | — |
| GET | `/api/v1/records` | `dataset:read` (`dataset:edit` for `table=contributions`) | query, 1–500 (default 50) |
| GET | `/api/v1/audit` | `audit:read` | query, 1–500 (default 50) |
| PATCH | `/api/v1/review/records/{table}/{row_id}` | `dataset:edit` | — |

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

**Users** — `GET /api/v1/admin/users` lists accounts, `POST` creates one, and
`PUT …/{username}` / `PUT …/{username}/password` / `POST …/{username}/revoke-sessions` act on one.
The server is **strict** on all five (`user:manage` **and** the admin role, both `strict=True`), so
they 401 an anonymous caller in `warn` mode too — `GET /api/v1/admin/users` answering 401 without a
credential is the contract working, not a broken panel.

The server enforces nothing that protects the *caller* (`zolai-core/zolai/api/session_auth.py`:
`set_user_role`, `set_user_enabled`, `change_password`), so the panel says what each write does:

| Write | What the server does | What the panel adds |
|-------|---------------------|---------------------|
| `enable` / `promote` | widens access | nothing — undoable in one click |
| `disable` | revokes **every** live session of the account, in the same request | confirm; warns when the row is yours (this browser is signed out) or the last enabled admin (way back: `zolai user enable`) |
| `demote` | takes effect on the target's **next request** (`reset_session_cache`) | confirm; same two warnings — and for the last admin it says there is **no supported undo at all**, because `/settings` needs admin to open and `zolai user` has no role command |
| `revoke-sessions` | revokes every live session, returns a **count** | confirm naming the account |
| own password | revokes every live session **including the caller's** | the dialog says you will be signed out, and success drops the local session rather than leaving a dead token to 401 every panel |

The row the server says is *you* (`GET /auth/me` → `username`) carries a **you** badge. With an admin
**API key** there is no badge at all: the server cannot map a key to an account, and marking a row
would be a guess. A **403** on this panel ("this credential lacks the scope or role") renders as
*Not permitted*, not as a raw `forbidden`.

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

Several registry files carry documented local edits — `bunx shadcn@latest add` overwrites them, so
re-apply after any refresh:

- `ui/table.tsx` — added an optional `containerClassName` so `DataTable` can put shadcn's
  `scroll-fade-x` affordance on the element that actually scrolls.
- `ui/{dialog,sheet,select,dropdown-menu}.tsx` — `IconPlaceholder` (a shadcn-"create"-app import
  that does not exist here) resolved to the lucide icons it names; their static `shadow-md`/
  `shadow-lg` became the theme-aware `shadow-popover`/`shadow-modal` elevation tokens.
- `ui/sonner.tsx` — wired to `src/lib/theme.ts` instead of `next-themes`.
- `ui/button.tsx` — `max-lg:min-h-10` on the text sizes (`default`/`xs`/`sm`/`lg`): every control
  carries the 40px touch target below `lg`. The `icon-*` sizes are deliberately *not* floored —
  Dialog/Sheet close buttons are `icon-sm` and absolutely positioned; a floor would overlap titles.
- `ui/card.tsx` — `shadow-card` elevation token; `CardTitle` renders as a real `role="heading"`
  `aria-level={2}`.
- `ui/alert.tsx` — the `destructive` variant draws the `--destructive-surface` /
  `--destructive-border` pair instead of raw `/10` opacity washes.

App-level composition is shared too, and routes reuse it instead of re-spelling markup: `Notice`
(one tone map for info/warning/danger/success boxes), `PageHeader` (the page's single `<h1>` in the
heading face), `StatGrid` (responsive tile grid), `MetaList` (`—` for unknown values),
`DataFreshness` (`fetched 4 min ago · Refresh`, always *this browser's receive time*, never a
server claim) and `CopyValue` (clipboard button whose confirmation is built from a label alone —
nothing it copies can reach a toast). Plus
`DataTable`'s unit-tested footer (`rowsSummary` keeps *fetched*, *shown*, *limit* and *reach* as
separate facts — a footer may only advise an action the page offers; see `AGENTS.md`).

### Theme

Class-based `.dark` on `<html>`, three preferences — `system | light | dark` — persisted under
`zolai.theme`.

- **No flash.** `index.html` runs a small *blocking* script in `<head>` that resolves the
  preference and sets the class, `style.colorScheme` and `<meta name="color-scheme">` before first
  paint. `src/lib/theme.test.ts` asserts the script is present, comes before the module entrypoint,
  and encodes the same rules as `src/lib/theme.ts`.
- The TopBar switch shows sun/moon for the resolved theme and names the three choices in the menu.
- `system` follows `prefers-color-scheme` live via `matchMedia`.
- Only `--primary*` / `--ring*` are customised for hue (emerald, the previous brand accent); the
  rest is the stock neutral shadcn token set, so light and dark both ship in one CSS file. On top
  of the stock set the theme layer owns: `--font-heading` — Cormorant Garamond Variable, the org
  display face, self-hosted via `@fontsource-variable/cormorant-garamond` (applied through the
  `cn-font-heading` utility; no third-party font request); a three-step elevation scale
  (`--elevation-card/popover/modal` exposed as `shadow-card/popover/modal`, theme-aware); and a
  destructive *surface* pair (`--destructive-surface` / `--destructive-border`) so error boxes
  have a token instead of scattered opacity literals.

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

- **`/rag` writes its answer with the resolved provider, and says which.** Retrieval is real —
  `context` and `citations` come from the corpus — and `answer` is now written by the provider the
  request resolves, the same path the assistant uses. The response states which: `generated`,
  `retrieval_only`, `provider`, `model` and `provider_error`. The panel titles the result
  *"Answer"* or *"Evidence only — no model wrote this answer"* on those flags, never by
  pattern-matching the prose. A request may also override `provider` / `model` per call.
  **On the current deployment no provider key resolves, so every answer is honest retrieved
  evidence** — see the S1 provider entry in `docs/OPEN-ISSUES.md`.
- **`/analyze/sentence` returns empty `pos`, `grammar` and `entities`.** Re-verified against the
  deployment: 6 tokens, 0 pos, 0 grammar, 0 entities. Only tokens are rendered; the rest is
  labelled with the server's own note.
- **`sentence_frequency` is always 0** → shown as `—`.
- **`morphology` and `forms` are usually empty** → collapsed with a pointer to the Forms tab.
- **`/review/stats` is not available on the versioned API.** Re-verified: `/api/v1/review/stats`
  answers `404 {"detail":"Not found"}`, while the unversioned `/review/stats` 422s because
  `/review/{item_id}` swallows `stats` and parses it as an integer. No review count is rendered
  anywhere as if it were real; `/links` links to the server-rendered `/review/` queue instead and
  labels it.
- **The `forms` / `morphology` / `grammar_usage` fields *on a `/word/{w}` entry* are empty** →
  those panels collapse to a *Not populated* note that names the endpoint, so an empty list is never
  read as a failed request. Verified: `pasian`, `bang` and `thei` each return 0 for all three while
  `pos` is 1–2. This is **not** the `/word/{w}/forms` sub-resource, which is populated (9–20 rows
  at `limit=20`) and renders normally — two separate fields that must not be reported as one.
- **`/learning/assistants` and `/learning/bindings` are live but empty.** Re-verified: both answer
  `200` with empty arrays and appear in `/openapi.json`. The Orchestra page shows *"No assistant
  surfaces yet"* for that empty list. A true `404` (route absent on an older deployment) still gets
  a separate *"not available on this deployment"* state — empty and missing must not share copy.
- **`/learning/run` clamps an anonymous caller to `limit` 50.** The server caps the work budget by
  role and reports it: `limit_applied` is what ran and `limit_clamped` is true when the request asked
  for more. The run panel prints both and never implies the full page was produced.
- **Auth is in `warn` mode** → verified live via `GET /auth/me` (`mode: "warn"`). Privileged routes
  still answer `401` without a credential (`/admin/ai-providers`, `POST /agent/runs`), while public
  reads such as `/word/{w}` stay open. The shell banner is sourced from that `mode` field so it nags
  only while warn and anonymous — flip to `enforce` and the 401s become the signal instead.

The same list is rendered as cards on `/links` under "Known API gaps".

## Tests

```bash
bun run test
```

924 Vitest specs across sixty-two files:

- `src/lib/api.test.ts` — 401 → `ApiError` with `needsKey`; 15s timeout budget and abort →
  `timeout` / `aborted` distinction; transport failure → `network`; **empty body tolerated** instead
  of `JSON.parse('')`; malformed JSON → `parse`; FastAPI 422 envelope flattened to one line —
  including items that carry **no `msg`**, which render as `loc`-prefixed `key=value` pairs or a
  capped JSON fragment and never `[object Object]`;
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
  equals the server limit — with the truncation advice matched to the route's `reach` (`limit`,
  `cursor`, or neither). Plus the **hidden-column maths**: `HIDE_BELOW_TIERS` must equal the keys of both
  the class map and the media-query map (a tier that hides without being watched is the bug), each query
  carries its breakpoint's own rem (`sm` 40 · `md` 48 · `lg` 64 · `xl` 80), `hiddenTiersAtWidth` returns
  exactly the tiers still *below* a viewport, and `hiddenColumnsAt` names at most three columns before
  collapsing to `(+N more)`, falls back to the column `key` for a non-string header rather than printing
  `[object Object]`, and emits nothing when nothing is hidden.
- `src/components/DataTable.test.tsx` — the marker's reactive half: under a static render the table cannot
  know the viewport, so it must neither throw nor invent a hidden-column notice (the server snapshot is
  all-visible), and its markup reaches for no native `title` (WCAG 1.4.13). Read as source, the component
  drives the sentence from the **same** `HIDE_BELOW_QUERY` media queries through `useSyncExternalStore` +
  `hiddenColumnsAt`, keeps `matchMedia` in the component so the pure helper stays node-safe — and its copy
  is a statement about the viewport ("hidden at this width"), never a claim that the data is absent.
- `src/lib/tags.test.ts` — the chip dedupe: the live `pos: ['Noun', 'NOUN']` pair collapses to one
  chip keeping the **first spelling seen**, distinct tags and order survive, blanks drop, and nothing
  appears in the output that the input did not contain.
- `src/lib/auth.test.ts` — `rankOf` / `can` / `roleBadge`, the tolerant `AuthMeSchema`, and the
  command palette's role filter.
- `src/features/agent/api.test.ts` — run timeout budget and the `POST /agent/runs`,
  `GET /agent/runs/{id}` and feedback transports (method, path, body).
- `src/features/assistant/api.test.ts` — `assistantChatPath` public/admin routing, the
  `assistantChatBody` shape (provider/model/`api_key` in, **never `user_provider`**) and the
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
  `identitySummary` reports the credential the **server** named: a session (username, role, and a
  source line that does not attribute the role to a key's scopes), a recognised key, or a **warn** —
  never a claimed success — when a stored key is unrecognised; `hasKey` only triggers that warning, it
  no longer decides whether the identity shows at all. Plus the registry-flag mutation probe:
  flipping `palette` changes `inPalette`, `signInSurfaces` and `routeCommandsFor` membership. And the
  **consequence is credential-aware**: the footer sentence says what *this* sign-out ends (a session
  leaves a stored key alone, a key clears the key + cache), and source guards pin that the password
  form's Sign out sits inside `me.auth_source === 'session'` while the key form's sits inside
  `canLeaveKey` — a button that promises to end a credential the browser is not holding is a control
  advertising an action the page cannot take.
- `src/lib/session.test.ts` — sign-in is verify-then-store: the candidate key goes out in the
  header only and never the URL, a 200 + no `key_prefix` is a **rejected** key, a 401 is rejected
  while a transport failure is *unreachable*, a blank paste never reaches the network, a rejected key
  stores nothing and leaves an existing key intact, and sign-out clears key + cache. **One credential
  is active at a time**: password sign-in clears the stored key, and key sign-in ends an active
  session — locally first, then `POST /auth/logout` — because `credentials.ts` sends the session in
  preference to the key, so a key stored underneath one is a key that is never sent. Plus the
  **failure-mode mapping**: `verifyFailureMessage` / `verifyFailureNotice` name each mode
  (*nothing was sent* / *does not recognise* / *could not reach*), keep **key rejected** and **API
  unreachable** distinct (the latter blames transport — CORS, bot challenge — and never calls the key
  bad), and contain no generic "login failed".
- `src/components/KeyDialog.test.tsx` — source guards that the dialog stores through `signIn` and
  never writes `localStorage` itself (two entry points, two meanings of "saved" was the defect), that
  the success toast sits after the `ok` branch returns, and that its description says what saving
  does: verify first, and end any password session in the tab.
- `src/lib/healthPoll.test.ts` — the pause store behind the ⋯ menu's **Pause auto-refresh**:
  polling by default with nothing written, the `zolai.healthPollPaused` slot written as `true` and
  *removed* (never `false`) on resume, a foreign value not read as a pause, a blocked store costing
  persistence but not the operator's explicit pause (a session mirror), and subscriptions firing on
  both edges only.
- `src/components/HealthPill.test.tsx` — the pill is a **display observer, not the poll**: read as source,
  it must not set any `refetchInterval`, must not own a poll constant, and must take `healthDisplaySpec`
  from the observer module; rendered, the paused pill says `paused` **on the badge**, keeps its spinner off,
  and carries **no `animate-ping`** — a liveness animation on a stopped poll would read as live.
- `src/components/HealthObserver.test.tsx` — the shell's single poll. `healthObserverSpec(paused)` keys the
  query `health` (so a display subscriber dedupes against it rather than starting a second loop), maps a
  pause to `refetchInterval: false` — TanStack's off value, not `0` — keeps the 30s interval when running,
  and changes nothing else. `healthDisplaySpec()` shares that key with the interval pinned off. The observer
  renders empty markup and fetches `/health` key-free through `HEALTH_URL`, never `API_BASE`. The last group
  is the cross-file guard: the observer is the **only** file in the app that sets a live `refetchInterval`,
  the pill and the ⋯ menu set none, and `AppShell.tsx` mounts the observer **exactly once** — which is what
  makes the poll continuous below `lg`, where the pill itself lives inside a menu.
- `src/features/apikeys/api.test.ts` — the `/admin/api-keys` transports (list, create, rotate,
  revoke) with method/path/body, tolerant parsing, honest 404/422 messages, and `isActiveKey`.
- `src/features/apikeys/keyActions.ts` + `keyActions.test.ts` — the **minting rank cap**. `create` and
  `rotate` resolve the rank the scopes would hand the new key and refuse one above the caller
  (`403 scope_above_actor`); rotation replays the old key's scopes, so a legacy `*` key is refused for
  the same reason it could not be issued. Pinned here: the two scope bands (`*`/`role:manage` are
  superadmin, `apikey:manage`/`settings:write`/`user:manage` stop at admin), equal rank being allowed,
  an unknown scope word never inventing a rank, and the refusal naming only the offending scope.
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
  `remote` vs `catalog`, 403 surfaced), `modelsFor` listing only the chosen provider's models, and
  `modelPlaceholder` — the model picker asks for a provider first (not "nothing published"), says a
  chosen row published no models, and invites a pick otherwise. There is **no selector default** by
  design: an empty selection means no override, so the server keeps its own default instead of the
  first (alphabetical, keyless) catalog row.
- `src/features/users/api.test.ts` — the `/admin/users` transports (list, create, update, password,
  revoke-sessions) with method/path/body, trimming on create, optional `display_name`/`role` omitted
  when blank, numeric `enabled` normalised to a boolean, no `password_hash` ever expected in a row,
  and honest `username_taken` / `user_not_found` / `invalid_input` messages.
- `src/features/users/accountActions.ts` + `accountActions.test.ts` — **which account write needs a
  confirm step, and what it must say.** `enable`/`promote` need none (they widen access and undo in
  one click); `disable` / `demote` / `revoke-sessions` always confirm, and the copy gains a warning
  when the row is *your own* account or the **last enabled admin** — the two cases with no in-browser
  undo. Every refusal the writer can answer with is quoted first (`role_change_requires_superadmin`,
  `target_requires_superadmin`, `self_role_change`, `self_disable`, `last_superadmin`), because a
  control that leads to a 403 is a trap rather than a warning. `createAccountFields` decides the
  create body: an actor below superadmin sends **no `role`** — `POST /admin/users` tests a non-member
  start against the caller *before* inserting, so sending it would mean no account at all.
  `endsOwnSession` decides the one case where a password change signs the caller out: the
  target is your account **and** the active credential is a session (an API key is not a session).
  Pure, so all four actions × self/last-admin/actor-rank are pinned rather than eyeballed.
- `src/features/users/UsersPanel.test.tsx` — the panel rendered through `react-dom/server`: the row
  the **server** named is marked `you` and no other; an admin **API key** marks nothing (the server
  cannot say whose account it is, so the panel must not guess); no confirm dialog is armed on first
  render. And the rank split itself: a superadmin gets the row's role `Select`, an admin gets the rank
  as text, Enable/Disable is offered for a member row by anyone with `user:manage` and withheld from an
  admin on an admin-or-above row — with the reason printed where the control was.
- `src/components/ErrorState.test.tsx` — the shared failure surface: **401 says the credential was
  refused** — an expired session and a revoked key both arrive as 401, so the copy names neither and
  points at the way back in — while **403 says "Not permitted"** (the server's raw `forbidden` token
  explains nothing over the admin
  users list) with no Retry either way, and a 5xx stays retryable and stays silent about permission.
  Also the `describeError` kernel every toast reads: the stable `code` for each transport failure,
  the tone map (`needsKey` → warning, 403 → neutral, the rest → destructive), and the guard that a
  raw thrown value renders a **fixed sentence** — never its own text, which can carry request
  internals into a screenshot.
- `src/components/DataFreshness.test.tsx` — the receive-time labels: a nullish, zero, negative or
  non-finite time can never produce a fetched claim or a digit ("not fetched yet", not
  `fetched 0 min ago`), a future timestamp floors to `just now`, the minute/hour/day boundaries and
  their singular/plural forms, and the wording guard that the copy says **fetched** and never
  "updated"/"synced"/"current" — the number is this browser's receive time, not a server claim. The
  rendered line is asserted too: the absent branch emits no timestamp and no `N min ago`, and an
  in-flight query shows the action as running rather than idle.
- `src/components/CopyValue.test.tsx` — the clipboard copy contract: the confirmation and the
  failure line are built from a **label and nothing else** (`copyConfirmationMessage` takes no
  value parameter, so it cannot echo key material), `Copied` with no label, `Copied the raw JSON`
  with one, and the failure naming only what was not copied. Plus the **rendered** guard: the
  server-rendered markup is asserted not to contain the secret in any attribute, so a future
  `title={value}` fails the suite instead of shipping.
- `src/routes/Review.test.tsx` — the row-disclosure contract: a value at exactly the limit is **not**
  truncated (no control for a value that fits), a truncated cell renders the true prefix, and the
  full value is reached by a real `type="button"` toggle with `aria-expanded`, never by a native
  `title` — the rendered markup is asserted to carry no `title=` at all, because a tooltip is neither
  keyboard-reachable nor hover-persistent (WCAG 1.4.13). `aria-controls` appears only while open, so
  it never points at an id that is not in the DOM. Plus the **URL-state contract** (read as source, because
  node cannot mount the page): the tab, table and filter are no longer seeded from local state, the page
  reads through `reviewPanelFromSearch` and writes with `replace`, no whitelisted table is named by hand
  (the default comes from the registry), one `TAB_LABELS` map feeds both the trigger and the chip so they
  cannot disagree, the cursor stack stays out of the URL *with its comment saying why*, the applied state is
  `FilterChips` rather than a path-mixed heading, the request path sits in the Card subtitle, a ✕ appears only
  where the page holds the setter and never at a default, "Clear all" cannot drop the `table` the API
  requires, the count is stated from the payload and never as a total, and the empty state points at the
  chip's ✕ instead of a control that no longer exists.
- `src/features/role-requests/requestActions.ts` + `requestActions.test.ts` — the ask/decide rules for
  `/requests`: who may ask at all (a member and an admin each see only the ranks **strictly above**
  them, a superadmin is at the top of the ladder, an anonymous visitor is sent to sign in, and a key or
  OAuth token is refused by the route itself — `session_required` — because a request has to be tied to
  an account row that can hold a role); reason length bounds measured after trim; the reject-requires-a-note
  rule; and the `?status=` codec, which reads only the closed set and falls back to `pending`.
- `src/routes/Requests.test.tsx` — the same page rendered per credential: a member gets the form
  defaulting to admin, an admin's default is superadmin, a superadmin is told there is nothing left to
  ask for, a **superadmin API key** still gets the sign-in line (rank is not the problem, the credential
  type is); the queue renders only for a superadmin and only offers `Decide` on a pending row; own asks
  distinguish a granted/rejected decision and a missing note; and "contributing needs no role" links to
  `/contribute` rather than to the form. Source guards keep any credential out of the query string.
- `src/components/FilterChips.test.tsx` — the applied-filter contract: a chip is removable **only** when
  it carries an `onRemove`, the ✕ is a real `type="button"` with `aria-label="Remove filter: …"` naming
  the filter it drops, a non-removable chip renders as a plain badge rather than a dead button, "Clear
  all" appears only with ≥2 removable chips, removal is announced through an always-mounted
  `role="status"` live region, and no `title=` reaches the markup.
- `src/routes/Data.test.tsx` — source guards that `/data` traded its prose filter block for
  `FilterChips`, drops `?collection=` through the registry (`navigate(pathOf('data'))`, never a path
  literal), states the filtered count from what the payload returned (`filtered.length` of
  `formatCount(rows.length)`) rather than a computed total, and re-points the empty state at the chip's ✕
  instead of the "Show all collections" link that no longer exists.
- `src/components/AppShell.test.tsx` — the shell layout guards: the routed panel area carries no
  `max-w-6xl` clamp but keeps its `<main>` gutters (#25), and a navigation resets the document to
  `scrollY 0` keyed to `location.pathname` **alone** — a `?limit=` change is a control the user moved
  and must not yank them to the top (#19).
- `src/components/AuthBanner.test.tsx` — the auth-mode banner's dismissal, kept off the raw global the same
  way `lib/sidebar.ts` keeps its preference: `readDismissedMode(storage)` answers `null` for **no store, a
  throwing store, and a foreign value** (an unguarded `sessionStorage.getItem` in a `useState` initializer
  took the shell's static render down with `ReferenceError: sessionStorage is not defined`),
  `writeDismissedMode` cannot throw on a blocked store, and `bannerMuted(stored, mode)` mutes **only the mode
  that was dismissed** — a blanket session flag would have kept the promise in the banner's own doc block
  false, because a stored `warn` must not silence the notice after the deployment flips to `enforce` and
  back. Read as source: the component touches `globalThis.sessionStorage` in one try-wrapped accessor only,
  the dismiss control carries no native `title=` (WCAG 1.4.13) and grows to `max-lg:size-10` for a 40px
  touch target.
- `src/lib/providerLiterals.test.ts` — the **no-hardcoded-target guard**: every non-test file under
  `src/` is scanned for provider ids and model ids (`pcore-brain`, `opencode/`, `gpt-*`, `claude-*`,
  `gemini-*`, …), and `ProviderModelSelect` must stay fed by `useProviderCatalog()` (with no
  auto-seed — an empty selection sends no override) so the selectors can never pin this UI to one
  deployment's catalog.
- `src/lib/routes.test.ts` — the route registry: unique ids/paths, every record labelled with a
  known icon + role, exactly one non-nav destination (sign-in, and it must be anonymous — the
  chicken-and-egg guard) which opts into ⌘K through the `palette` flag (no nav record may carry it),
  the palette exposing one command per palette route with the same path/role and exactly one extra
  (`nav-login`), deep-link resolution (`/word/:word` → `/word`), the `?from=` / `?collection=` query
  builders, and the **Word panel codecs**: `?tab=` + one `?limit_<sub>=` per sub-resource round-trip,
  defaults are omitted, unknown/malformed values are dropped, over-large ones are clamped through the
  endpoint registry and *reported*, repeated keys resolve last-wins — and the built string must be
  byte-identical through `URLSearchParams`, because the page writes through `setSearchParams` and a
  grammar using `:`/`,` would reach the address bar as `%3A`/`%2C`. And the **Review codecs**: `?tab=` from
  the closed set (`browse`/`audit`) + `?table=` validated against the records whitelist + a free-text `?q=`,
  round-tripped over every tab and table, defaults and an all-whitespace filter omitted, every tab and table
  name asserted to sit inside the characters the serializer cannot escape (tested against the registries, not
  a copy of the names), eleven hostile `q` values escaping exactly once and reading back as themselves, a
  repeated key resolving last-wins, and the closed-set parameters byte-identical. Plus the **path drift guard**: `pathOf` resolves every id to its own recorded path,
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