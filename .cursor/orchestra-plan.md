## Goal

Hide the warn-mode `AuthBanner` whenever `GET /auth/me` reports a non-anonymous role (session or API key), so a signed-in admin never sees a Sign-in CTA nag.

## Context alignment

- No `context/*.md` in this repo (noted; used `AGENTS.md` + live sources).
- Role is server-only via `useAuthMe()` / `authModeNotice` — never invent identity from storage alone.
- Sign-in stays discoverable from top bar / sidebar / ⌘K for every role; only the warn banner is gated.

## Diagnosis (screenshot mismatch)

| Observation | Explanation |
|---|---|
| Banner body: "You are signed in as admin" | **Pre-fix** `authModeNotice` used `` `You are signed in as ${role}.` `` when `role !== 'anonymous'` |
| Current `auth.ts` body: "You are anonymous…" | Post-`896ec34` copy; only reachable when `show: true` (anonymous + warn) |
| Nav "Signed in" + banner both visible | Same `/auth/me` role (`admin`); old code showed banner for **all** roles in warn mode |
| Not a dual-identity bug | TopBar + AuthBanner both call `useAuthMe()`; screenshot is consistent with old `show` for admin |

Root cause: warn banner gated only on `mode === 'warn'`, not on anonymity. Fixed locally; production likely still on the old bundle (`main` is **7 commits ahead** of `origin/main`).

## Approach

1. **Treat primary code as done** — HEAD `896ec34` already changes `authModeNotice` to `show: false` when `role !== 'anonymous'`, drops the "signed in as ${role}" branch, and updates `auth.test.ts`.
2. **Verify only** — re-run auth unit tests (and typecheck if touching nothing else). Do **not** re-implement the same guard.
3. **Optional hardening (only if verify finds a residual)** — `useAuthMe` generation today bumps on `subscribeApiKey` only; password login calls `clearApiKey()` + `resetQueries()`, so identity should refresh. If a session-only path can change without that, also subscribe `subscribeSession` into the generation bump. Out of scope unless a failing case appears.
4. **Ship** — deploy so `studio.zolai.space` matches HEAD (banner gone for admin/member; still shown for anonymous + warn).
5. **Do not expand** into Agent/Assistant copy from the same commit — already landed; unrelated to this goal.

## Files to touch

| Path | Action |
|---|---|
| `src/lib/auth.ts` | **Verify only** — guard + anonymous-only body already present |
| `src/lib/auth.test.ts` | **Verify only** — "never nags a signed-in user" already present |
| `src/components/AuthBanner.tsx` | **No change expected** — already `authModeNotice(me.mode, me.role)` then `if (!notice.show) return null` |
| `src/lib/auth.ts` (generation) | *Touch only if* session-without-key-refetch gap is proven |
| Deploy (`bun run deploy`) | Required for production to match screenshot fix |

## Git commit strategy

- Banner hide already committed: `896ec34 fix(studio): hide warn-mode banner when signed in + …`
- Implementer: if tree stays clean after verify → **no new commit**; proceed to deploy when asked.
- If session-subscribe hardening is needed → separate commit: `fix(auth): refetch /auth/me on session store changes`

## Risks / open questions

- Screenshot may be **stale production**; local HEAD may already be correct — confirm with `bun run test` on auth specs + deploy status.
- `896ec34` also changed Agent/Assistant; leave them alone for this goal.
- Session generation subscribe is speculative; do not add without a repro.

## Done when

- [ ] `authModeNotice('warn', 'admin'|'member').show === false` (unit tests green)
- [ ] `authModeNotice('warn', 'anonymous').show === true` with anonymous body + Sign-in CTA
- [ ] Live studio (after deploy): signed-in admin sees no AuthBanner; anonymous still does in warn mode
- [ ] No regression: TopBar still shows "Signed in" from `signInEntry` when role ≠ anonymous
