# Code Standards

## General

- Use bun for install, scripts and tests; never npm or yarn (source: README.md, AGENTS.md).
- Never invent data: if the API does not return a field, render an honest empty state (source: AGENTS.md).
- Conventional Commits on `main`; keep the tree clean (source: AGENTS.md).
- Do not modify `zolai-core`, `zolai-web` or `zolai-landing` from this repo (source: AGENTS.md).

## TypeScript

- Strict TypeScript with `strict`, `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax`; no `any` and no `console.*` in `src/` (source: AGENTS.md).
- Verification uses `bun run typecheck` (`tsc -b --force`), `bun run test` (Vitest) and `bun run build` (source: package.json, README.md, AGENTS.md).
- Error handling goes through `ApiError`; feature files must not inspect `response.ok` (source: AGENTS.md).

## React + Vite

- Tailwind 4 via `@tailwindcss/vite`; no separate Tailwind config, PostCSS config or CSS modules (source: AGENTS.md).
- shadcn/ui primitives in `src/components/ui/` are vendored copies; add with the shadcn CLI, never by hand (source: AGENTS.md).
- One TanStack Query hook per endpoint in `src/features/<area>/api.ts`, wrapping an exported plain async transport (source: AGENTS.md).
- Registry-driven routes, endpoints and sign-in surfaces: no path or endpoint literals in components (source: AGENTS.md).
- Role gating reads only the server's `GET /auth/me`; the UI never derives a role from a stored key (source: AGENTS.md).

## Styling

- Tokens before literals: `--font-heading`, elevation tokens, destructive surface tokens and chart colors live in `src/index.css` (source: AGENTS.md, src/index.css).
- Use `cn-font-heading` for headings and theme-aware shadow utilities for overlays (source: AGENTS.md, src/index.css).
- Mobile-first classes and 40px+ touch targets; tables stay usable at 375px with announced hidden columns (source: AGENTS.md).

## API Routes

- No backend routes live here; endpoint shapes are fixed by the deployed Zolai Core API (source: AGENTS.md).
- Do not change the API surface to suit the UI; `/health` stays outside `/api/v1` and is derived from the API origin (source: AGENTS.md).

## Data and Storage

- The API and `data/zolai.db` are maintained in `zolai-core`; check canonical tables when a count looks wrong (source: AGENTS.md).
- Never commit an API key; stored credentials live in `localStorage` and `sessionStorage`, and minted secrets are shown once and dropped (source: README.md, AGENTS.md).
- Zod schemas are tolerant by design; do not tighten them against empty API fields (source: AGENTS.md).

## File Organization

- `src/routes/` — route panels, including route component tests (source: git ls-tree -r HEAD -- src).
- `src/components/` — shared app composition (source: git ls-tree -r HEAD -- src).
- `src/components/ui/` — vendored shadcn/ui primitives (source: git ls-tree -r HEAD -- src).
- `src/features/` — one API module per backend area (source: git ls-tree -r HEAD -- src).
- `src/lib/` — registries, auth, credentials, theme and pure helpers with tests (source: git ls-tree -r HEAD -- src).
