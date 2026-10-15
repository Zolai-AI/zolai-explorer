# Open issues — Zolai Explorer

_Last updated: 2026-10-15. A working document: what this session fixed, what is
still open, and which observed behaviours are deliberate. Not a roadmap._

## Fixed in this session (2026-10-15)

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
5. **README test count is stale** — it says "378 Vitest specs across twenty-one
   files"; the suite is 500 specs across 31 files. No test enforces that number;
   refresh it on the next README edit.

## Deployment notes

- **S1 — no provider key resolves on the current deployment.** Every `/rag`
  answer is therefore honest retrieved evidence and the panel says so
  (provenance comes from the response's `generated` / `retrieval_only` flags,
  never from the prose). Server-side credential state, not a Studio bug.

## No open UI bugs known

As of `bdcd191` there are no known open bugs on the header or the provider/model
selector surfaces. Anything observed after that commit belongs above with a date.
