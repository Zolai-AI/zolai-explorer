# Architecture Context

## Stack

| Layer | Technology | Role | Source |
|-------|-----------|------|--------|
| Language | TypeScript | Application language | project.yaml, package.json |
| UI | React, shadcn/ui | Component framework and vendored primitives | project.yaml, package.json, AGENTS.md |
| Build | Vite | Dev server and static bundler | project.yaml, package.json |
| Routing | React Router | Registry-driven routes | package.json, AGENTS.md |
| Data fetching | TanStack Query, TanStack Table | Server data and tables | package.json, AGENTS.md |
| Forms | React Hook Form, Zod | Form state and validation | package.json |
| Charts | Recharts | Chart panels | package.json, src tree |
| Feedback | Sonner | Toasts | package.json |
| Styling | Tailwind CSS | CSS-first token layer | package.json, AGENTS.md, src/index.css |
| Fonts | Geist, Cormorant Garamond | Self-hosted body and display faces | package.json, AGENTS.md, src/index.css |
| Icons | Lucide React | Icon set | package.json |
| Testing | Vitest | Unit and component tests | package.json, README.md |
| Package manager | bun | Dependency and script runner | project.yaml, AGENTS.md |
| Hosting | nginx on pcore-server | Static bundle at `studio.zolai.space` | README.md, AGENTS.md |

## System Boundaries

- `src/routes/` — one panel component per documented route (source: git ls-tree -r HEAD -- src, README.md).
- `src/components/` — shared composition components such as AppShell, DataTable, Notice and Empty (source: git ls-tree -r HEAD -- src, AGENTS.md).
- `src/components/ui/` — vendored shadcn/ui primitives owned by this repo (source: git ls-tree -r HEAD -- src, AGENTS.md).
- `src/features/<area>/api.ts` — one TanStack Query hook per endpoint, wrapping an exported plain async transport (source: AGENTS.md, git ls-tree -r HEAD -- src).
- `src/lib/routes.ts` — single source of truth for destinations, role minimums and nav/palette flags (source: AGENTS.md).
- `src/lib/endpoints.ts` — single source of truth for endpoint method, path, scope and limit (source: AGENTS.md).
- `src/lib/auth.ts`, `src/lib/credentials.ts`, `src/lib/session.ts` — server-derived role and exactly-one-credential resolution (source: AGENTS.md).
- `src/index.css` — Tailwind token layer with `:root`, `.dark` and `@theme inline` (source: src/index.css, AGENTS.md).
- `scripts/` and `deploy/nginx/` — deploy, e2e and UI-check scripts plus the reference vhost (source: package.json, README.md, AGENTS.md).

## Storage Model

- **Application database**: N/A — source: package.json, README.md. The API and `data/zolai.db` are maintained in `zolai-core` (source: AGENTS.md).
- **Browser storage**: API key in `localStorage` under `zolai.apiKey`; session token in `sessionStorage` under `zolai.session` (source: README.md, AGENTS.md).
- **Static assets**: `dist/` is rsync'd to `/var/www/zolai-studio` and served by nginx (source: README.md, AGENTS.md).
- **React Query cache**: runtime response cache; minted secrets are deliberately not React Query mutations (source: AGENTS.md).

## Auth and Access Model

- `/health` is public and key-free; the shell and dashboard render without a credential (source: AGENTS.md).
- API key sign-in verifies against `GET /api/v1/auth/me` before storing; username/password sign-in uses `POST /api/v1/auth/login` and stores a session token (source: README.md, AGENTS.md).
- Exactly one credential is sent: session wins, else key, never both; each sign-in path ends the other (source: AGENTS.md).
- Roles come only from the server's `GET /auth/me`; `<RequireRole>` shows a prompt, never a guessed 404 (source: AGENTS.md).
- Minted plaintext secrets are shown once and dropped; stored keys are only ever displayed masked (source: AGENTS.md).

## System Design & Infrastructure

| Concept | Service / Tech | Notes | Source |
|---------|---------------|-------|--------|
| **Compute** | Static Vite bundle on nginx | No backend of our own | README.md, AGENTS.md |
| **Database** | N/A — source: package.json | API and database live in zolai-core | package.json, AGENTS.md |
| **Object Storage** | N/A — source: README.md | No bucket in this repo | README.md |
| **CDN** | N/A — source: README.md | Served from the studio host, not a CDN config | README.md |
| **Caching** | TanStack Query | One hook per endpoint; dataUpdatedAt drives freshness copy | AGENTS.md, src tree |
| **Queue / Async** | N/A — source: package.json | No queue dependency | package.json |
| **Rate Limiting** | N/A — source: AGENTS.md | Enforced by the server; distinct failure copy in UI | AGENTS.md |
| **Load Balancing** | N/A — source: README.md | nginx serves a single static root | README.md |
| **Microservices** | Separate Zolai Core API | Cross-origin reads and proxied role-gated writes | README.md, AGENTS.md |
| **Observability** | N/A — source: package.json | No observability dependency in HEAD | package.json |
| **Search** | API-backed `/api/v1/search` | Transport in `src/features/analyze/api.ts` (`useSearch`) | README.md, src tree |
| **Streaming / Realtime** | Health polling | `HealthObserver` / `healthPoll` over the public `/health` route | src tree, AGENTS.md |

## Scaling & Performance Constraints

- Traffic volume: UNKNOWN — source: README.md.
- Latency target: UNKNOWN — source: README.md.
- Data growth estimate: UNKNOWN — source: README.md.
- Availability target: UNKNOWN — source: README.md.
- Budget constraint: UNKNOWN — source: README.md.

## Invariants

1. Never commit an API key; no key in a tracked file, URL, query string or console output (source: AGENTS.md).
2. Never invent data — if the API does not return a field, render an honest empty state (source: AGENTS.md).
3. Do not modify `zolai-core`, `zolai-web` or `zolai-landing` from this repo (source: AGENTS.md).
4. Keep `/health` outside `/api/v1` and derive it from the API origin, never from the API base (source: AGENTS.md).
5. Keep endpoint paths in `src/lib/endpoints.ts` and route paths in `src/lib/routes.ts`; no literals elsewhere (source: AGENTS.md).
6. Use bun only; pinned dependencies are not bumped opportunistically (source: AGENTS.md).
