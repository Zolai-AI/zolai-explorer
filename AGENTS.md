# AGENTS.md — Zolai Explorer

Working rules for this repo. Read this before changing code.

## What this is

A **read-mostly studio** over the deployed Zolai Core API. It ships a static Vite bundle that nginx
serves from disk on its own host at `https://studio.zolai.space/`. There is no backend of our own —
every piece of data comes from `https://api.zolai.space` at runtime, cross-origin.

Almost everything is read-only. The **exceptions are role-gated writes** that proxy a server-side
permission, never a UI-invented one: provider settings (`/admin/ai-providers`, admin +
`settings:write`), agent runs and feedback (`/agent/runs`, member+ + `agent:run`), and assistant
chat. The role always comes from the server's `GET /auth/me` — see `src/lib/auth.ts` — and a route
below its minimum renders a **prompt** via `RequireRole`, never a 404 and never a guess.

**Never invent data.** If the API does not return a field, the UI says so. There is no mock layer
and no fixture fallback in the app code (test payloads live only in `*.test.ts`, and they are
verbatim captures from the live API).

## Non-negotiables

1. **Never commit an API key.** The key lives in `localStorage` (`zolai.apiKey`) and is sent only as
   the `X-API-Key` header. No key in any tracked file, no key in a URL or query string, no `console`
   output of the key, no key in `.env.example`. If you add a credential-shaped string, it must be a
   placeholder. **Sign-in is verify-then-store** (`src/lib/session.ts`): probe `/auth/me` with
   `apiFetch(..., { apiKey })` and persist only when the server recognises the key. `/auth/me` is
   public and never 401s, so "200 with no `key_prefix`" means *rejected* — never store that. There
   are no accounts and no login endpoint in `zolai-core`: do not invent a username/password flow or
   a session the server cannot back.
2. **A minted plaintext key is shown once and dropped.** `POST /admin/api-keys` (and `rotate`) are
   the only responses that carry a secret. They are therefore plain transports, **not** React Query
   mutations, so nothing parks a secret in the mutation cache: keep it in the dialog's local state,
   show it, and clear it on close. The stored key is only ever displayed masked.
3. **Do not modify `zolai-core`, `zolai-web` or `zolai-landing`.** This repo is a separate git repo
   inside the workspace; the root `AGENTS.md` forbids cross-repo drift.
4. **Do not change the API surface to suit the UI.** Endpoint shapes are fixed by the deployed
   server. If a field is missing or empty, render an honest empty state.
5. **The studio lives on its own host.** `vite.config.ts` has `base: '/'`, nginx serves
   `/var/www/zolai-studio` under `server_name studio.zolai.space`, and `api.zolai.space` only
   301-redirects `/explorer*` here. Never re-embed the SPA in the API vhost, never change
   `location /` there (it proxies to `127.0.0.1:8001`), and never put a key in `.env.production` —
   it is committed and inlined into the public bundle.
6. **Keep `/health` outside `/api/v1`.** It is public and key-free; the shell and dashboard must
   render with no key at all. `API_ORIGIN` + `/health` is what makes that work cross-origin — never
   build it as `API_BASE + '/health'`.

## Honesty rules (this is the whole point of the app)

- `/rag` **does not call a model**. `context` and `citations` are real; `answer` is a template echo
  (the server holds a placeholder `GEMINI_API_KEY`). Never describe the answer as generated, and keep
  the amber notice in `src/routes/Rag.tsx` permanent — not dismissible.
- `/analyze/sentence` returns empty `pos`, `grammar`, `entities`. Render tokens; label the rest.
- `sentence_frequency` is always `0` → render `—`.
- Empty `forms` / `morphology` / `grammar_usage` → collapse to a *Not populated* `Empty` that names
  the endpoint it came from, never a blank or half-rendered panel.
- **Bars start at zero.** Width = `value / largest` (`zeroBasedBarPercent`), with the number and its
  share of the total printed beside it. No 1% floor, no min/max scaling, and row indexes start at
  `0` (`rowIndexLabel`) — a value that reads as "0" because of a scale choice is a lie.
- `/review/stats` is **not available** on the versioned API (`/api/v1/review/stats` answers
  `200 {"error":"Not found"}`; the unversioned path 422s because `/review/{item_id}` matches
  `stats`). Never render a review count as if it were real; link the server-rendered `/review/` queue
  and say that its stats sub-path does not work.
- **`retrieval_only: true` on `/assistant/chat` means no model ran.** Title it
  "Retrieval (no model)" and badge it `retrieval_only` — never "generated" or "AI answer". The
  provider/model line only renders when a model actually answered.
- **Provider secrets are write-only.** The catalog row carries a mask (`ref_masked`); render the
  mask and `configured`, never echo a pasted value back into state, the URL, or a toast.
- **Agent phases render exactly what the server recorded.** `ok` / `failed` / `skipped` / absent —
  an unreached phase is "pending", not "failed". Learn (`score >= 1`) queues hypothesis
  candidates only; never claim it wrote a canonical table.

If any of these change upstream, update the gap list in `src/routes/Links.tsx` **and** the matching
panel in the same commit.

## Conventions

- **bun, always.** `bun install`, `bun run build`, `bun run test`. Never npm/yarn.
- **Pinned exact versions** in `package.json`. TypeScript stays on `~5.9.3` — 7.x is published but
  the Vite/vitest type tooling has not caught up. Do not "helpfully" bump it.
- **Tailwind 4** via `@tailwindcss/vite`. No `tailwind.config.js`, no PostCSS config, no CSS modules.
  The token layer is CSS-first: `@theme inline`, `@custom-variant dark`, `:root` / `.dark` blocks in
  `src/index.css`.
- **UI kit is shadcn/ui** (`components.json` committed, style `radix-nova`, aliases `@/` → `src/`).
  Primitives live in `src/components/ui/` and are **vendored copies** — the CLI writes them in and
  you own them afterwards. Add new ones with `bunx shadcn@latest add -y -o <component>`; never
  hand-write a primitive or fork one under a new name. App-level composition belongs in
  `src/components/` (`Card`, `DataTable`, `Empty`, …) built *from* the primitives.
- **Theme is class-based.** `.dark` on `<html>`, preference `system | light | dark` persisted under
  `zolai.theme`. Resolution logic is pure in `src/lib/theme.ts` (unit tested); the **blocking script
  in `index.html` must stay in sync with it** — it is what prevents a flash of the wrong theme.
- **Mobile-first.** Base classes are the small-screen layout; scale up with `sm:` / `md:` / `lg:`.
  Navigation is a `<Sheet>` drawer below `lg` and a persistent sidebar from `lg`. Interactive
  controls carry `max-lg:h-10`/`max-lg:h-11` for a 40px+ touch target. Tables must stay usable at
  375px: use `hideBelow` column priority plus the scrolling container, never a fixed layout.
- **The endpoint table has exactly one source of truth: `src/lib/endpoints.ts`.** It holds method,
  path template, required scope, `limit` placement/cap and the honest note per route. Transports
  call `endpointPath(id, params)` / `queryLimitPath(id, params, limit)`; **never write a path
  literal** in a feature file. `/links`, the README API table and the known-gap copy all render from
  those records, and `src/lib/endpoints.test.ts` fails if a literal reappears, if a record is never
  used, or if the README drifts. There is no `page_size` in this API — `limit` is the only name, and
  it travels in the query string on GET routes and in the JSON body on the POST search/RAG routes.
- **One TanStack Query hook per endpoint** in `src/features/<area>/api.ts`. `GET`s are queries;
  the `POST` endpoints (`/analyze/*`, `/search`, `/rag`) are mutations — they run on demand, not on
  mount. Each hook is a thin wrapper over an **exported plain async transport** (`fetchAiProviders`,
  `postAssistantChat`, …) so node-env tests can assert method/path/body with a stubbed `fetch`.
- **The route list has exactly one source of truth: `src/lib/routes.ts`.** The router
  (`App.tsx`, `PAGES` keyed by `RoutePath`), the sidebar (`NAV_ROUTES` + the `NAV_ICONS` map),
  the command palette (`ROUTE_COMMANDS`, ids `nav-{id}`) and every role gate read it. Add a route by
  adding a registry record — never by hand-editing a nav list, and never by adding a `<Route>` that
  no nav entry points at. Deep links with a path parameter go in `PARAM_VARIANTS` with the registry
  path they belong to.
- **Role gating has exactly one source of truth: the server.** `src/lib/auth.ts` reads `GET
  /auth/me` and exports `useRole()` (reactive) plus pure `rankOf`/`can`/`roleBadge`. Route access
  goes through `<RequireRole minimum={gateMinimum(spec)}>` — the minimum comes from the route
  registry, never a literal in `App.tsx` (`routes.test.ts` fails the build if one appears); the
  sidebar (`NAV_ITEMS.minRole`, mapped from `NAV_ROUTES`) and command palette (`filterCommands`)
  filter with the same `can()`. Never derive a role from the stored key, and never gate only in the
  UI — the server still enforces it and an honest 401/403 must surface.
- **Server-side limits, not client-side pagination.** The word sub-resources take `limit` (1–100,
  evidence 1–200); the footers say `showing N rows (limit L)` and warn when `N === L`, because these
  endpoints return bare arrays with no server total. A "of N rows" total over fetched rows is a lie —
  do not reintroduce one.
- **Zod schemas are tolerant by design** (`.catch([])` / `.catch({})`). Do not "tighten" them: the
  live API returns empty arrays for fields that are simply not populated yet, and a strict schema
  would turn that into a user-facing error.
- **Error handling goes through `ApiError`.** Do not inspect `response.ok` in a feature file. Branch
  on `error.kind` / `error.needsKey`.
- **`formatCount` / `formatUptime` / `formatScore` / `percent`** from `src/lib/format.ts` for all
  numbers. No ad-hoc `toLocaleString()` in panels.
- Strict TypeScript: `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. No
  `any`. No `console.*` in `src/`.
- Conventional Commits. `main` branch. Keep the tree clean.

## Verifying a change

```bash
bun run typecheck    # tsc -b --force
bun run test         # 142 vitest specs
bun run build        # must be warning-free
```

After any deploy:

```bash
curl -sI https://studio.zolai.space/            | head -1   # 200
curl -sI https://studio.zolai.space/word/pasian | head -1   # 200 (SPA fallback)
curl -sI https://api.zolai.space/health         | head -1   # 200 (no regression)
ssh pcore-server 'sudo -n nginx -t'
```

After any CSS change, confirm **both** themes ship in the built stylesheet:

```bash
grep -o ':root{[^}]*}' dist/assets/*.css | head -c 120   # light tokens
grep -o '\.dark{[^}]*}' dist/assets/*.css | head -c 120 # dark tokens
```

## Deploy mechanics

- `scripts/deploy.sh` (wrapped by `bun run deploy`) builds, rsyncs `dist/` to
  `pcore-server:/var/www/zolai-studio`, runs `nginx -t`, then reloads. It **does not** edit the
  nginx config — the vhost `/etc/nginx/sites-available/zolai-studio` is installed by hand, and its
  reference copy lives in `deploy/nginx/zolai-explorer.conf`.
- `--delete` is guarded: the script aborts unless the remote dir ends in `/zolai-studio`.
- The build must carry an absolute `VITE_API_BASE` (`.env.production`, committed). The script greps
  the bundle for it and for the absence of `/api/v1/health` before shipping.
- Back up a vhost before any manual config edit.

## Context

`data/zolai.db` and the API are maintained in the `zolai-core` repo. The canonical tables this UI
summarises live in `context/architecture.md` and `docs/database/tables.md` at the workspace root —
check those when a count looks wrong, rather than "fixing" the dashboard.

Language ground truth: **ZVS 2018** — SOV word order, ergative `in`, `kei` for negation in all
persons, `hiam` for yes/no questions, `bang hang` + V + S + `hiam` for content questions. Do not
introduce deprecated forms (`pathian`, `ram`, `fapa`, `bawipa`, `siangpahrang`, `cu/cun`) into UI
copy or test fixtures.