# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- LIVE — static studio workbench served at `studio.zolai.space` (source: README.md, AGENTS.md).

## Current Goal

- Keep the workbench honest over the live Zolai Core API with server-derived roles and no invented data (source: README.md, AGENTS.md).

## Completed

- 2026-11-24 — Replaced the six context scaffolds with committed HEAD evidence: live status, stack, boundaries, tokens and conventions are now sourced from tracked files. Files: `context/project-overview.md`, `context/architecture.md`, `context/ui-context.md`, `context/code-standards.md`, `context/ai-workflow-rules.md`, `context/progress-tracker.md`. Impact: documentation only; no application code changed.
- React + Vite + shadcn/ui architecture unchanged; no framework migration or new component kit (source: AGENTS.md).
- Existing shadcn components and styling utilities reused; no dependency edits in the alignment pass (source: AGENTS.md).

## In Progress

- Known upstream gaps are tracked in `docs/OPEN-ISSUES.md` and the in-app links page (source: AGENTS.md, README.md).

## Next Up

- UNKNOWN — source: README.md.

## Open Questions

- UNKNOWN — source: docs/OPEN-ISSUES.md.

## Architecture Decisions

- Separate host for the studio: nginx serves `dist/` from `/var/www/zolai-studio`; `api.zolai.space` only redirects `/explorer*` here (source: AGENTS.md, README.md).
- Single registries for endpoints, routes and role gating; tokens are CSS-first in `src/index.css` (source: AGENTS.md).
- Credentials: verify-then-store, one active credential, session wins over API key (source: README.md, AGENTS.md).

## System Design Checklist

Refer to `architecture.md` > System Design & Infrastructure when adopting new
infrastructure concepts. Each row documents a decision point with service choice
and trade-offs.

## Session Notes

- Verify with `bun run typecheck`, `bun run test` and `bun run build`; after deploy, check both host responses and both theme token blocks (source: README.md, AGENTS.md).
- Do not modify `zolai-core`, `zolai-web` or `zolai-landing` from this repo (source: AGENTS.md).
