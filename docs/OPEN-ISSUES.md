# Open issues — Zolai Explorer

_Last updated: 2026-10-18. A working document: what this session fixed, what is
still open, and which observed behaviours are deliberate. Not a roadmap._

## Fixed in this session (2026-10-18) — admin user management, audited then hardened

The brief was "make the Studio's admin surface provably complete and healthy".
**The transport contract was already exact** — all five `/admin/users` calls
(list / create / update / password / revoke-sessions) match
`zolai-core/zolai/api/admin_users_router.py` on method, path, request body and
response shape, and `USER_ROLES = ['member','admin']` matches the server's
`VALID_ROLES`. No mis-wired or missing call, no wrong method or path. The real
gaps were in what the panel *does* and *says* around those calls:

1. **Destructive writes fired on one click, with no confirmation and no
   self-target or last-admin warning.** The server protects nothing here:
   `set_user_role` rewrites the row and calls `reset_session_cache()`, so a
   demotion lands on the target's *next request*; `set_user_enabled` revokes
   every live session of the target when disabling; `change_password` revokes
   every live session of the target. One misclick on your own row — or on the
   last admin's — removes the admin surface from the browser permanently:
   `/auth/me` answers `member`, `RequireRole` renders the prompt, and no in-app
   control can undo it. **Fixed** with `features/users/accountActions.ts` (pure,
   exhaustively unit-tested) driving an `AlertDialog` confirm (the vendored
   primitive, already the house idiom in `KeyDialog.tsx`); `enable`/`promote`
   stay one-click because they widen access and undo in one click. The copy is
   per-action: disabling the last admin names `zolai user enable`, while
   demoting one says there is no supported undo at all (see item 1 below).
2. **The panel could not tell which row was you.** **Fixed** — the row matching
   the username `GET /auth/me` reports carries a **you** badge. It deliberately
   shows nothing for an API-key credential: the server cannot map a key to an
   account, so a marker would be a guess.
3. **A 403 on the users list rendered as `Request failed (HTTP 403)` + the raw
   token `forbidden`.** Every *write* path in this repo already maps 403 to
   honest copy (`Settings.tsx`, `ApiKeysPanel.tsx`, `lib/agentErrors.ts`); the
   panel-level read path was the only one that did not. **Fixed** in the shared
   `ErrorState`: 403 → *Not permitted* ("this credential lacks the scope or role
   it requires"), never a retry, while 401 keeps the key prompt.
4. **A self password change silently ended your own session.** The server revokes
   *every* live session for the target — including the caller's — so the admin
   got an ordinary success toast and was then signed out, leaving a dead token
   that made every panel 401 until a reload. **Fixed** — the dialog says you will
   be signed out, and on success the local session is dropped (`signOut()`) with
   a toast that says so.

Docs kept in sync: the README `/settings` row, a new **Users** subsection in the
admin section (the write table above), the test-count and test-list updates, and
this file.

## Known gaps / remaining


- **Mobile header** — logo-only below `sm` with tiered controls so the overflow
  menu stays reachable (`d448f49`, `7a3312d`).
- **Settings** — admin *Refresh models* wired to the shared transport, and
  Enter commits a rename once instead of twice (`a676dbe`).
- **Provider catalog** — any role can re-fetch `GET /api/v1/providers`, and a
  stale selection reconciles against the fresh catalog (`e61df89`).
- **Review page** — the table selector no longer overflows below `sm` (`1f20302`).
- **Top bar a11y** — the API-key button carries an `sr-only` label below `md`
  (`178bf09`).
- **Reconcile invariant** — `reconcileSelection` is pinned as a fixpoint
  (reconciling a reconciled value is the identity, so the picker corrects once
  and cannot loop) (`b4b73ab`).
- **Provider-literals guard** — `providerLiterals.test.ts` now scans `*.test.ts`
  as well as app source, and every vendor id fixture was genericised
  (`bdcd191`).

## Known gaps / remaining

1. **`TODO(reconcile)` — no mounting test for the reconcile effect**
   (`src/components/ProviderModelSelect.test.tsx`). Asserting "corrects exactly
   once on mount and never again" needs a DOM implementation
   (`@testing-library/react` + jsdom, or a `createRoot` + `act` harness); the
   suite is deliberately vitest `node` env with no DOM dependency. The invariant
   the effect relies on is pinned by the fixpoint test instead (see
   `features/providers/api.test.ts`). Adding a DOM env would be a new
   dependency — a decision, not an oversight.
2. **640–768px shows the palette and theme controls twice** — inline in the top
   bar *and* inside the ⋯ menu. Mirrored entries; deliberate, not a duplicate by
   accident.
3. **>900kB chunk notice** — pre-existing on `vite build`, addressed by a
   separate code-splitting change made concurrently by another session
   (`cee92d6`, vendors split and pages lazy-loaded). It had not landed when this
   document was first drafted; as of `bdcd191` the build is warning-free and the
   largest chunk is `charts` (~326 kB).
4. **`/health` answers 405 to HEAD, 200 to GET** — verified live
   2026-10-15 (`curl -sI https://api.zolai.space/health` → `HTTP/2 405`; GET →
   `200`). The post-deploy snippet in `AGENTS.md` uses `curl -sI` for the health
   check, which therefore reports 405; use a GET (`curl -s -o /dev/null -w
   '%{http_code}'`) for that one line.
5. **~~README test count is stale~~** — **fixed 2026-10-18**: the README now reads
   "539 Vitest specs across thirty-four files" (re-measured after this session's
   three new spec files). No test enforces that number, so it can drift again —
   re-measure on the next README edit rather than trusting the previous number.

## Observed, deliberately not changed (2026-10-18)

Recorded so the next session does not mistake them for oversights:

1. **`zolai user` has no role command** (`zolai-core/zolai/cli/main.py` — the
   subcommands are `create`, `list`, `disable`, `enable`, `password`,
   `revoke-sessions`). So **demoting the last admin has no supported undo**: the
   panel that could promote it back needs admin to open, and the CLI cannot
   restore a role at all — it takes a direct database change. That is a
   `zolai-core` gap (this repo must not touch it), and the confirm copy now says
   so instead of pointing at a command that does not exist. Disabling *is*
   recoverable (`zolai user enable`), and the copy distinguishes the two.
2. **`revoke` on the API-keys panel has no confirmation either**
   (`src/features/apikeys/ApiKeysPanel.tsx:200`). Same class as the users-panel
   defect fixed here, but revoking a key is recoverable (issue a new one) and it
   is outside this session's brief — fix both together so the admin surface has
   one rule, not two.
3. **A 401 on the users panel still reads "API key required"** even when a
   *session* is the active credential and has simply expired or been revoked.
   `ApiError.needsKey` is 401-only by contract and `ErrorPanel` cannot tell the
   two apart; narrowing that needs a credential-aware branch, which touches every
   panel. Copy-only, no data is hidden.
4. **Self-demotion still leaves the shell showing the old role until it
   refetches.** The server is authoritative on the next request and the honest
   403/`RequireRole` prompt follows, so nothing lies — but forcing an identity
   refetch after a self-affecting write would be smoother. Left alone because it
   means the feature layer reaching into `lib/auth`'s query keys.
5. **Nothing here was proven against the live API with a real admin credential.**
   The 401/403 behaviour is enforced server-side and was not exercised
   end-to-end (anonymous 401 is the only live check available: `GET
   /api/v1/admin/users` → 401). The transport shapes come from the deployed
   router source, and direct `curl` is blocked by Cloudflare's managed challenge
   — so a founder pass with a real admin session is still the last word.

## Deployment notes

- **S1 — no provider key resolves on the current deployment.** Every `/rag`
  answer is therefore honest retrieved evidence and the panel says so
  (provenance comes from the response's `generated` / `retrieval_only` flags,
  never from the prose). Server-side credential state, not a Studio bug.

## No open UI bugs known

As of `bdcd191` there are no known open bugs on the header or the provider/model
selector surfaces. Anything observed after that commit belongs above with a date.
