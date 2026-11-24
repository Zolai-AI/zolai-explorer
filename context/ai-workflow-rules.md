# AI Workflow Rules

## Approach

Build incrementally against the committed context files and the
one-source-of-truth registries they describe. `project-overview.md` defines the
workbench scope, `architecture.md` fixes boundaries, `ui-context.md` holds the
committed token layer, `code-standards.md` defines the conventions, and
`progress-tracker.md` records state. Never invent data, keep endpoint and route
paths in their registries, and take roles only from the server. Source: AGENTS.md,
HEAD context files, README.md.

## Scoping Rules

- Work on one feature unit at a time
- Prefer small, verifiable increments over large
  speculative changes
- Do not combine unrelated system boundaries in a
  single implementation step

## Performance Scoping (Monorepo)

- Use `rg` (respects `.ignore`) for search — not bare `find` or `grep -r`.
- Read only the files needed for the current task — do not dump-read directories.
- Cap tool output: `tool_output.max_lines=300, max_bytes=12288` (set via orchestra token profile).
- For monorepos: open the subproject directory, not the root, when possible.
- **Monorepo `opencode.json` `instructions` scoping**: `NARROW_INSTRUCTIONS` uses `**/AGENTS.md` etc. which match every subproject. In large monorepos, this can still inflate tokens. Best practice: scope `instructions` per subproject (e.g., `subproject1/AGENTS.md`, `subproject2/AGENTS.md`) in each subproject's `opencode.json` rather than relying on root-level globs. The `BROAD_INSTRUCTION_GLOBS` denylist (`**/**`, `**/templates/**`, `**/context/**`) is enforced by `filterBroadInstructions()` to strip known token-inflating patterns. Watcher ignores and tool output caps already bound memory/CPU.

## When to Split Work

Split an implementation step if it combines:

- Panel markup in `src/routes/` or `src/components/` versus transport code in `src/features/<area>/api.ts` (source: AGENTS.md, git ls-tree -r HEAD -- src).
- Endpoint registry changes in `src/lib/endpoints.ts` versus route registry changes in `src/lib/routes.ts` (source: AGENTS.md).
- Token changes in `src/index.css` versus component composition, including the blocking theme script (source: AGENTS.md, src/index.css).

If a change cannot be verified end to end quickly,
the scope is too broad — split it.

## System Design Triggers

When starting a new feature, check whether it triggers
any of these system design concerns. If yes, define the
approach in `architecture.md` > System Design before
implementing:

| Trigger | Consider |
|---------|----------|
| File uploads / media | Object storage + CDN + signed URLs |
| Background / deferred work | Queue, worker, retry policy |
| Expensive or repeated query | Caching layer (CDN, Redis, in-memory) |
| Global user base | CDN, multi-region, load balancing |
| Bursty traffic / abuse risk | Rate limiting, throttling, WAF |
| Independent deploy cycles | Microservice boundary, contract testing |
| Debugging production issues | Observability: logs, metrics, traces |
| Search / discovery feature | Dedicated search index vs DB query |
| Realtime UI updates | WebSocket, SSE, polling, Durable Objects |
| Data growth beyond 1M rows | Connection pooling, read replicas, sharding |

## Handling Missing Requirements

- Do not invent product behavior not defined in the
  context files
- If a requirement is ambiguous, resolve it in the
  relevant context file before implementing
- If a requirement is missing, add it as an open question
  in `progress-tracker.md` before continuing

## Protected Files

Do not modify the following unless explicitly instructed:

- `src/lib/endpoints.ts` — single source of truth for every endpoint this app calls; tests fail if a literal reappears (source: AGENTS.md).
- `src/index.css` — the committed CSS-first token layer; verify both `:root` and `.dark` blocks ship after any change (source: AGENTS.md, src/index.css).
- `src/lib/routes.ts`, `src/components/ui/` and `bun.lock` — registry, vendored primitives and pinned dependency tree; do not rewrite casually (source: AGENTS.md, git ls-tree -r HEAD).

## Keeping Docs in Sync

Update the relevant context file whenever implementation
changes — **mandatory, not optional**:

| If you change... | Update this file |
|---|---|
| System architecture or boundaries | `context/architecture.md` |
| Storage model decisions | `context/architecture.md` |
| Code conventions or standards | `context/code-standards.md` |
| Feature scope | `context/project-overview.md` |
| Workflow or scoping rules | `context/ai-workflow-rules.md` |
| Any implementation | `context/progress-tracker.md` (add entry with date + description) |

**Progress-tracker entry format:**
```
- YYYY-MM-DD — Description. Files: `path/file1`, `path/file2`. Impact: what changed.
```

**Rule:** A commit without a progress-tracker entry is incomplete.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. `bun run build` passes, with `bun run typecheck` and `bun run test` (source: README.md, AGENTS.md).

## Environment Divergence

When a check passes in one environment but fails in another
(e.g. local vs CI vs on-box), record the delta before adjudicating:

- Runtime version — bun is required and the node runtime is declared in `project.yaml`; exact versions are UNKNOWN — source: README.md, project.yaml.
- Dependency tree — `bun.lock` is committed at the repo root and dependencies are pinned (source: git ls-tree -r HEAD, AGENTS.md).
- Env vars and secret presence — names only, never values: `VITE_API_BASE`, `ZOLAI_UPSTREAM`; `.env.production` is committed and must contain no credential (source: README.md, AGENTS.md).
- Network reachability — `api.zolai.space`, `studio.zolai.space` and the `pcore-server` deploy host are named in HEAD docs (source: README.md, AGENTS.md).
- Filesystem paths — `dist/`, `/var/www/zolai-studio`, `deploy/nginx/zolai-explorer.conf` and the reference nginx vhost (source: README.md, AGENTS.md).

A failure explained entirely by a recorded delta is an environment gap,
not a code regression — fix the environment or pin the dependency.
Never "fix" it by weakening the check.

## Concurrent Session Guard (session-claims)

Other AI sessions may be editing the same repo at the same time. Before
implementing, and again before committing:

```bash
bash <orchestra>/scripts/session-claims.sh check "$PWD" <paths-you-will-touch>
```

- `check` → visibility only (shows other sessions working on those paths)
- `claim`/`renew`/`release` → tracking for coordination
- Multiple sessions can work in parallel; use `check` to see who's working on what

Claim your own work at phase start, renew on long operations, release when done:

```bash
bash scripts/session-claims.sh claim  "$PWD" --scope "app/,packages/" --task "goal text"
bash scripts/session-claims.sh renew  "$PWD"
bash scripts/session-claims.sh release "$PWD"
```

Claims auto-expire after 30 min without heartbeat (`gc` purges them). Set
`PCORE_SESSION_ID` in your session env for stable identity across shells.

