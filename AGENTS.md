# AGENTS.md — Zolai Explorer

Working rules for this repo. Read this before changing code.

## What this is

A **read-only studio** over the deployed Zolai Core API. It ships a static Vite bundle that nginx
serves from disk at `https://api.zolai.space/explorer/`. There is no backend of our own — every
piece of data comes from `https://api.zolai.space` at runtime.

**Never invent data.** If the API does not return a field, the UI says so. There is no mock layer
and no fixture fallback in the app code (test payloads live only in `*.test.ts`, and they are
verbatim captures from the live API).

## Non-negotiables

1. **Never commit an API key.** The key lives in `localStorage` (`zolai.apiKey`) and is sent only as
   the `X-API-Key` header. No key in any tracked file, no key in a URL or query string, no `console`
   output of the key, no key in `.env.example`. If you add a credential-shaped string, it must be a
   placeholder.
2. **Do not modify `zolai-core`, `zolai-web` or `zolai-landing`.** This repo is a separate git repo
   inside the workspace; the root `AGENTS.md` forbids cross-repo drift.
3. **Do not change the API surface to suit the UI.** Endpoint shapes are fixed by the deployed
   server. If a field is missing or empty, render an honest empty state.
4. **Do not touch the API's `location /`.** nginx must keep proxying `/` to `127.0.0.1:8001`. The
   SPA only ever lives under `/explorer/`. Always run `sudo nginx -t` **before** any reload.
5. **Keep `/health` outside `/api/v1`.** It is public and key-free; the shell and dashboard must
   render with no key at all.

## Honesty rules (this is the whole point of the app)

- `/rag` **does not call a model**. `context` and `citations` are real; `answer` is a template echo
  (the server holds a placeholder `GEMINI_API_KEY`). Never describe the answer as generated, and keep
  the amber notice in `src/routes/Rag.tsx` permanent — not dismissible.
- `/analyze/sentence` returns empty `pos`, `grammar`, `entities`. Render tokens; label the rest.
- `sentence_frequency` is always `0` → render `—`.
- Empty `forms` / `morphology` / `grammar_usage` → collapse with an explanatory `Empty`, never a
  blank or half-rendered panel.
- `/api/v1/review/stats` returns 422 → link to `/review/` instead.

If any of these change upstream, update the gap list in `src/routes/Links.tsx` **and** the matching
panel in the same commit.

## Conventions

- **bun, always.** `bun install`, `bun run build`, `bun run test`. Never npm/yarn.
- **Pinned exact versions** in `package.json`. TypeScript stays on `~5.9.3` — 7.x is published but
  the Vite/vitest type tooling has not caught up. Do not "helpfully" bump it.
- **Tailwind 4** via `@tailwindcss/vite`. No `tailwind.config.js`, no PostCSS config, no CSS modules.
- **No UI kit.** Components are hand-rolled in `src/components/`. Do not add one.
- **One TanStack Query hook per endpoint** in `src/features/<area>/api.ts`. `GET`s are queries;
  the `POST` endpoints (`/analyze/*`, `/search`, `/rag`) are mutations — they run on demand, not on
  mount.
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
bun run test         # 51 vitest specs
bun run build        # must be warning-free
```

After any deploy:

```bash
curl -sI https://api.zolai.space/explorer/            | head -1   # 200
curl -sI https://api.zolai.space/explorer/word/pasian | head -1   # 200 (SPA fallback)
curl -sI https://api.zolai.space/health               | head -1   # 200 (no regression)
ssh pcore-server 'sudo -n nginx -t'
```

## Deploy mechanics

- `scripts/deploy.sh` (wrapped by `bun run deploy`) builds, rsyncs to
  `pcore-server:/var/www/zolai-explorer/explorer/`, runs `nginx -t`, then reloads. It **does not**
  edit the nginx config — the snippet in `deploy/nginx/zolai-explorer.conf` is installed by hand.
- The `explorer/` subdirectory is required: nginx concatenates `root` with the whole `$uri`, so
  `/explorer/index.html` resolves to `/var/www/zolai-explorer/explorer/index.html`.
- A backup of the vhost is taken before any config edit.

## Context

`data/zolai.db` and the API are maintained in the `zolai-core` repo. The canonical tables this UI
summarises live in `context/architecture.md` and `docs/database/tables.md` at the workspace root —
check those when a count looks wrong, rather than "fixing" the dashboard.

Language ground truth: **ZVS 2018** — SOV word order, ergative `in`, `kei` for negation in all
persons, `hiam` for yes/no questions, `bang hang` + V + S + `hiam` for content questions. Do not
introduce deprecated forms (`pathian`, `ram`, `fapa`, `bawipa`, `siangpahrang`, `cu/cun`) into UI
copy or test fixtures.