# zolai-explorer — Zolai Explorer

## Overview

A studio workbench for the live Zolai Core API, served as a static Vite bundle at
`https://studio.zolai.space/` and reading the API cross-origin from `https://api.zolai.space`.
It renders semantic cards, tables and grids over real API responses and labels what the
API did not populate; the exact payload stays one click away in a raw JSON disclosure.
**Status: LIVE** — the deployed studio and its routes are documented in HEAD.
Source: README.md, AGENTS.md, project.yaml.

## Goals

1. Be a workbench rather than bare JSON forms: every panel renders semantic UI and an honest empty state (source: README.md).
2. Never invent data — if the API does not return a field, the UI says so; there is no mock layer (source: AGENTS.md).
3. Proxy only role-gated writes that mirror a server permission; the role always comes from the server (source: AGENTS.md).
4. Keep the single sources of truth for endpoints, routes and role gating intact (source: AGENTS.md).

## Core User Flow

1. A visitor opens a panel; the shell and dashboard render without a key because `/health` is public (source: README.md, AGENTS.md).
2. Optional sign-in verifies a credential against `GET /api/v1/auth/me` before storing it (source: README.md).
3. The visitor explores panels; panel state such as tab and limit lives in the URL where documented (source: README.md).
4. Role-gated controls appear only when the server reports the required role (source: AGENTS.md).
5. The visitor opens the raw JSON disclosure to see the exact response (source: README.md).

## Features

### Workbench panels

- Dashboard, word entry with sub-resource tabs, analyze, search, RAG, assistant, contribute and review (source: README.md).
- Agent runs with phase trace, orchestra learning registry, data collections, links reference and admin settings (source: README.md).
- One TanStack Query hook per endpoint in `src/features/<area>/api.ts` (source: AGENTS.md).

### Honesty and credentials

- Provenance-labelled RAG answers, zero-based bars, honest row counts and documented upstream gaps (source: README.md, AGENTS.md).
- Verify-then-store API key or username/password session; exactly one credential is sent (source: README.md, AGENTS.md).
- Theme-aware shadcn/ui primitives, a registry-driven command palette and mobile navigation (source: README.md, AGENTS.md).

## Scope

### In Scope

- The static studio UI over the deployed Zolai Core API, including its read panels and role-gated writes (source: README.md, AGENTS.md).
- Registry-driven routes, endpoints, navigation and role gating inside this repo (source: AGENTS.md).
- Deployment of `dist/` to the studio host with the documented nginx/rsync mechanics (source: README.md, AGENTS.md).

### Out of Scope

- The API itself: `zolai-core` owns the endpoints and `data/zolai.db` (source: AGENTS.md).
- Modifying `zolai-core`, `zolai-web` or `zolai-landing` from this repo (source: AGENTS.md).
- Mock data, fixture fallbacks in app code, and changing the API surface to suit the UI (source: AGENTS.md).
- A Next.js migration or a new component kit; neither is implemented (source: AGENTS.md).

## Success Criteria

1. `bun run typecheck`, `bun run test` and `bun run build` pass (source: README.md, AGENTS.md).
2. After deploy, the studio root and a deep link answer HTTP 200 and `/health` is unchanged (source: AGENTS.md).
3. Both light and dark token blocks ship in the built stylesheet after any CSS change (source: AGENTS.md).
