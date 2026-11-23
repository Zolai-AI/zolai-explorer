# Open issues — Zolai Explorer

_Last updated: 2026-10-29. A working document: what this session fixed, what is
still open, and which observed behaviours are deliberate. Not a roadmap._

## Fixed in this session (2026-10-26) — design-system foundation, DataTable honesty, shell P0, route lanes

The brief was "continue improve the UI/UX for studio, research design templates, fix with
multi-agents and loops". Gate at the end: **556 vitest specs / 34 files** (548 before the review
loop's six new classifier specs), warning-free build, and
the CDP `ui-check` harness **48 route × viewport combinations, 0 defects** — now covering
`/orchestra`, `/contribute` and the `/word/:word` deep link, which no automated check had ever
visited.

**Foundation.** `--font-heading` was an alias of the body font — every `cn-font-heading` hook in
the tree was a no-op. It now carries the org display face (Cormorant Garamond Variable,
self-hosted; journey.zolai.space uses the same serif). Added a theme-aware elevation scale
(`shadow-card/popover/modal`, replacing static `shadow-md/lg` on overlays), a
`--destructive-surface/border` token pair (the alert variant's scattered opacity washes now have
one home), and a 40px touch floor vendored into `button.tsx` text sizes. Four shared composition
components: `Notice`, `PageHeader`, `StatGrid`, `MetaList`; `ErrorState` gained tone
classification (needsKey → warning, 403 → neutral, 5xx/timeout/network → destructive);
`StatTile`/`Metric` render `—` for nullish values instead of a fabricated `0`.

**DataTable honesty contract.** `rowsSummary(shown, limit, fetched)` keeps three facts separate —
rows the server returned, rows on screen, the applied limit — fixing the footer that said
"showing 20 rows" while 10 were paginated. The footer now renders whenever `serverLimit` is set
(even without client pagination), the empty state renders inside the table body so headers survive,
numeric columns get `tabular-nums`, and an opt-in `filterable` global filter was added (tested by
3 new specs; the wording of a bespoke truncation notice in `Word.tsx`'s Forms/Contexts panels was
unified onto the canonical notice).

**Shell P0 — the 768px top-bar overflow.** Root cause: the health pill's longest label
("unreachable", 11 chars, `whitespace-nowrap` mono) was inline from `md`, and the wrapper span
could not shrink — the bar overflowed on every route exactly when the API was unreachable, the
state where the studio most needs to stay usable. Fix: the pill joins the inline row only from
`lg`; below that it stays reachable in the ⋯ overflow menu (widened from `md:hidden` to
`lg:hidden`). `TopBar.test.tsx` now pins the new tiers; the CDP run above verifies it in the
unreachable state, since local preview cannot pass CORS (pinned to `studio.zolai.space`).

**Route lanes (4 parallel agents, verified after integration).** Search: a subtitle printed a
limit the server never echoes — superseded by `DataTable serverLimit`; Analyze: an invented
"Depth" metric removed (no API field backs it) and the tokens/sentence mean rounded for display;
Data: `HEALTH_URL` removed from the statistics card; Rag: the Context tile bypassed
`formatCount` — aligned; Review: an unreachable `TabsContent` hid the entire CorrectionDialog
(Radix unmounts inactive panels) — hoisted to the page with a nullable row; dead
`aria-invalid` and `undefined as never` sort casts removed; Orchestra: the run-result table gained
`serverLimit={limit_applied}`, tiles moved to `StatGrid`; App `RequireRole`: a failed `/auth/me`
was blamed on the user's key — gained an explicit error branch with retry; Login: the password
error rendered under the username field — errors are now per-field with `aria-describedby`/
`aria-invalid` ids, eye toggles are 40px with `aria-pressed`; ApiKeysPanel: key revocation moved
behind an `AlertDialog` (label + `#id` only in the copy); Contribute: `SelectContent`
`min-w-[20rem]` clamped to the viewport; Assistant: one Card frame across loading/error/empty/
answer, copy no longer claims every answer names the model (renders `—` when the payload omits
it), raw `String(error)` toasts replaced with the `ErrorState` vocabulary; Agent: a sign-in branch
made unreachable by the route-level `RequireRole` was removed, phase chips moved from hard-coded
palette classes to `Badge` variants, evidence counts labelled; `CurationChart` no longer returns
`null` on error — a 404 says "not exposed on this deployment", other failures get the shared
error surface. `text-[10px]` micro-text was raised repo-wide to `text-xs`.

**Shared error classifier + theme gate (follow-up), then a review loop over the whole diff.**
`ErrorState` now exports `describeError` as the single failure classifier — `aborted` ("Request
cancelled") and `parse` ("Unreadable response") gained branches, the network case carries a fixed
sentence instead of the browser's raw "Failed to fetch", and a non-`ApiError` throw renders a
sanitised "The request did not complete." — raw exception text is a screenshot-able string. The
description gained a stable `code` field (`needsKey | timeout | forbidden | network | aborted |
parse | http | unknown`) so callers branch on classification, not prose. `Assistant.tsx`'s
`toastFailure` and `Agent.tsx`'s `failureToast` were rewritten onto it (Agent keeps its tested
`failedTitle`/`failedDetail` delegation for the specific 524/429/403 kinds).
`ui-check` gained `checkThemesShipped()`: it fetches the built stylesheet and fails if `:root`,
`.dark`, `--elevation-modal`, `--destructive-surface` or `Cormorant` is missing — the theme
system the foundation built can no longer regress silently.

Two review agents (standards, honesty+secret-hygiene) then swept the entire uncommitted diff and
found what the first pass missed: **three more duplicate `describe()` classifiers** in
`Settings.tsx`, `ApiKeysPanel.tsx` and `UsersPanel.tsx` — each keeping its one genuinely local
branch (admin-credential copy) and delegating the rest to `describeError`, which also sanitises
their former `String(error)` fallbacks. The same loop fixed: `AgentPhaseSchema.evidence_count`
moved to `nullableNum` (the schema's existing tolerant-null precedent) so a phase that reported
no evidence renders `—` instead of a fabricated `0`; four `text-[10px]` labels the sweep had
missed (Agent `PhaseMetric`, two in `Word`, one in `Assistant`) raised to `text-xs`; `Notice`
icons pinned to `size-4` (the wrapper span escaped the alert primitive's direct-child sizing);
the new `filterable` DataTable prop — shipped with zero callers — adopted on the Review **audit
log** tail and given the 40px touch floor; and the Analyze token chip documented as a 1-based
ordinal (not a row id, so the `rowIndexLabel` 0-based rule does not apply). Gate after the loop:
**554 vitest specs / 34 files** (6 new `describeError` kernel specs), warning-free build, ui-check
48/48 with the theme line passing.

## Second design loop (2026-10-26) — research-driven, and one live honesty defect

A web-research pass on operator-console design (NN/g, Carbon, Cloudscape, WCAG) produced seven
candidates; this loop took the three that were defects or near-free wins, and the rest are
listed under "Candidates not yet taken" below.

**Every remaining raw-echo toast is gone.** `ErrorState` gained `failureDetail(error)` (message +
hint as one line) and all 13 sites that wrote `isApiError ? error.message : String(error)` or
`error instanceof Error ? … : String(error)` now call it — `Search`, `Analyze`, `Rag`, `Review`,
`ProviderModelSelect` (2), `Orchestra` (5), plus the three admin `describe()` wrappers, whose
duplicated join the helper replaced. `HealthPill`'s tooltip and `agentErrors.ts`'s non-`ApiError`
branch carry fixed sentences instead of exception text. `grep -rn "String(error)" src` now returns
nothing outside the classifier itself and `lib/api.ts`.

**Truncation advice matched to what the page can do (honesty defect).** `rowsSummary` told every
truncated table "Raise the limit to see them" — including the review queue, which advances by an
opaque `cursor` and has no limit control at all, and the audit tail, where nothing on the surface
fetches more. The footer now takes a `reach: 'limit' | 'cursor' | 'none'` (`DataTable`
`rowsReach`, default `'none'` so a new table cannot over-promise) and each caller declares what it
offers: `Word` (4 tables + 2 direct summaries) and `Search` say `limit`, the review browse table
says `cursor`, the audit tail takes the default. Pinned by a new spec asserting that a `cursor`
notice must not contain "Raise the limit".

**Two smaller honesties.** The review pager said nothing when the server reported no further
pages; it now reads "end of results for this filter", and only when a payload has actually
arrived — an unknown `has_more` still must not read as a known end. `index.css` gained a
`prefers-reduced-motion: reduce` block: the health pill's `animate-ping` and the skeleton
shimmer ran with no user action and no way to stop them (WCAG 2.2.2/2.3.3).

One research finding was **wrong when checked**: the claim that the pill's `aria-live` region
re-announced an unchanged status every 30s. The badge's text only changes when health changes, so
React produces no mutation and nothing is re-announced; left as is.

Gate: **554 specs / 34 files**, warning-free build, ui-check 48/48 with the theme assertion.

**A verification agent then re-checked all four changes and found two.** (1) `Orchestra`'s
run-result table had been left on `reach: 'none'`, but that page does offer a Limit input that
feeds the next run — and the card's own empty state already advises it — so it contradicted
`Search`, which is the same shape and says `limit`. Now `rowsReach="limit"`
(`src/routes/Orchestra.tsx:747`). (2) `failureDetail` appended every hint to the toast, which
turned the 403 into a ~165-character sentence whose second half explains how roles work rather
than telling the user what to do. A hint now reaches the toast only when it names an action: the
403 keeps its full copy on the panel and loses the expository sentence in the toast, pinned by two
new specs (actionable-vs-expository, and a length ceiling so no toast outlives its own reading
time). Final gate: **556 specs / 34 files**.

## Third design loop (2026-10-27) — data freshness, and a copy affordance that cannot leak

Two parallel `frontend-engineer` agents, disjoint file ownership, both barred from
typecheck/build so the gate stays owned by the parent session.

**1. `components/DataFreshness.tsx`** — the "fetched 4 min ago · Refresh" line, over TanStack's
`query.dataUpdatedAt`. One rule drives it: that number is *this browser's receive time*, so the
copy says **fetched** and never "updated"/"synced"/"current" — pinned by a spec that asserts the
string contains none of those words. No timestamp renders as `fetched 0 min ago`: a nullish,
zero, negative or non-positive time yields an italic `not fetched yet` with no digits in it, and a
future value (clock skew) floors to `just now` so an age can never read negative. The relative
label re-renders on a 30s interval the component owns and clears on unmount; the absolute UTC time
sits in `title` because it cannot go stale. `subject` scopes the claim where a page has sibling
payloads. Wired to `Dashboard` (statistics), `Data` (collections — its Refresh targets the same
query the timestamp describes, not the existing "Refresh all") and `Word` (the entry query, and
only once a headword exists, because the query is disabled before that).
**Deliberately not wired:** `Search` and `Rag` — that payload is a user-triggered POST *mutation*
whose only timestamp is send time, and "Refresh" would re-run retrieval or an LLM; `Review` — two
tab-scoped cursor-paged queries, so no single governing payload owns the line.

**2. `components/CopyValue.tsx`** — icon-only ghost copy button (label in `aria-label`/`title`/
tooltip, `max-lg:size-10` touch floor, 2s check with the timer cleared on unmount), used in
`RawJson`'s disclosure strip and under the minted key in `ApiKeysPanel`. The secret-hygiene
contract is structural, not a caution: `copyConfirmationMessage(label?)` and
`copyFailureMessage(label?)` take a **label only and have no parameter that could receive the
value**, so the toast reads "Copied the raw JSON" and can never echo key material. The value is
read at click time, written straight to the clipboard, never held in state. There is deliberately
**no `execCommand`/off-screen-textarea fallback** — a hidden DOM node holding a minted secret is
exactly what a copy-it-once screen must not create; a blocked write degrades to a `Could not copy`
toast telling the user to select and copy.

Gate after merging both lanes, re-run against the tree as it now stands:
`bun run typecheck` clean · **594 specs across 41 files** · warning-free build · CDP `ui-check`
**48 route × viewport combinations, 0 defects** plus the theme assertion.

### The tree is shared — a second session committed mid-loop

While this loop ran, another `qodercli` session working the same repo landed four commits
(`#4` search submit, `#7` sidebar link semantics, `#2` robots/security.txt, `#25` content column
width) and left `deploy/nginx/zolai-explorer.conf` + `src/lib/csp.test.ts` uncommitted. Each staged
only its own files, so **none of this session's uncommitted work was swept into them** (verified by
grep against `HEAD` for `TRUNCATION_NOTICE` and `failureDetail`, both absent). Two consequences
recorded honestly: the 594/41 above is a *joint* count that includes their `csp.test.ts`, and it
moved 37 → 41 files while I was measuring — so that number is a snapshot, not a property of my
lane alone. Nothing here was committed by me.

## Fourth loop (2026-10-27) — worked the tracked issues instead of a research wishlist

The 2026-10-26 candidates were mine; the repo's actual UX defects are tracked as GitHub issues, and
a **second concurrent session** in this same repo was clearing them (#4, #7, #2, #25 committed while
loop 3 ran). So this loop targeted the remaining UX issues with three disjoint lanes.

**#14 (High) — `/links` Scope column overlapped Path.** Root cause was two mechanisms compounding,
not one: the Path cell carried `max-w-0` while the vendored `TableCell` forces `whitespace-nowrap`
(so the column collapsed to its padding in the auto table layout), and the write-method rows put
`truncate` on an **inline** `<code>` — `overflow`/`text-overflow` do nothing to an inline box, so the
route text painted straight out of its zero-width cell, under the Scope column. Fixed by giving the
cell a real `whitespace-normal` track that breaks mid-token on demand (`break-anywhere`) and dropping
the inert truncate wrappers: **the path is never truncated**, because a clipped route would defeat the
page's purpose. Verified in the browser, not just by reading: a CDP probe measured every cell of all
53 rows at 390/768/1280/1920 for content painting outside its own cell or clipped text —
**0 problems**, Path track 383px at mobile instead of collapsing — plus screenshots of the route at
mobile and wide.

**#23 (polish batch) — five of seven items taken:**
- **`Noun`/`NOUN` double chip.** Not a rendering bug — the server really sends `pos: ['Noun','NOUN']`
  for one part of speech (captured verbatim at `src/lib/schemas.test.ts:102`). `lib/tags.ts`
  `dedupeTags` collapses case-insensitive duplicates keeping the **first spelling seen**, drops
  blanks, preserves order, and never invents a tag. Applied in `TagRow`, so POS *and* Sources benefit.
- **Confidence wording** — the header row's `Conf` and the entry line's `conf` are now spelled out;
  abbreviations are exactly what a screen reader cannot expand.
- **Pager said 10 while the limit said 20.** `/word`'s tables paged the fetched rows at a hardcoded
  10 under a server default of 20. The page sizes are now the **same numbers the server accepts as a
  `limit`** (`WORD_LIMIT_CHOICES`) and the default page is the default limit, so the two controls
  cannot disagree on first paint. Pinned by a spec that resolves every tab's default through
  `resolvePageSize` and asserts it does **not** fall back — the silent coercion is the bug.
- **Internal paths in anonymous prose** — `data_root`'s container path is gone from the health
  tooltip (which is screenshot-able), and the Dashboard/Data "Data root" rows now say *the server's
  data directory* (or `—`), with the raw path left only inside the explicitly-labelled raw-JSON
  disclosure. `/links` no longer names `src/lib/endpoints.ts` in its intro.
- **"Clear key" was clickable with nothing to clear** — the dialog's field is write-only and reset
  on every open, so "something to clear" can only mean the store; the trigger is now
  `disabled={!hasKey}` using the store's own read, with no second source of truth invented.
- **Not taken:** `GEMINI_API_KEY`-style env names (not present in any user-visible string — the only
  such surface is the admin-gated `ref_masked` the docs mandate), and **#23.7 soft-404 → HTTP 200**,
  which is a host concern sitting in `deploy/nginx/zolai-explorer.conf` — the concurrent session's
  in-flight file for #1, so it was left alone deliberately rather than edited under it.

**Collocation spacing (#23.3)** matched the sibling `BarList` rhythm in `Charts.tsx` (label/tick 10→11,
right margin 48→56, default 240 height) — no new literals.

**Verifier pass over loop 3 found seven real defects, all fixed** (it was barred from building, and
correctly reported its own limits):
1. `CopyValue` awaited the clipboard write with **no unmount guard** — closing the mint dialog during
   a permission prompt set state on an unmounted tree *and* scheduled a revert timer nobody owned.
2. The highest-stakes hygiene guarantee was unpinned: the builders were tested but **not the rendered
   attributes**, so a future `title={value}` would have passed CI. Now a `renderToStaticMarkup` spec
   asserts the secret appears nowhere in the markup.
3. `title` **and** a Radix tooltip on the same trigger — two overlapping tooltips. `title` dropped.
4. Toast title and description both said "Could not copy" — title is now "Clipboard blocked".
5. `DataFreshness`'s honesty was only pinned in the pure function; the **rendered** absent branch is
   now asserted too (no `1970`, no `\d+ min ago`), which caught a bad assertion of my own — "not
   fetched yet" *contains* the word "fetched", so the check is for a positive claim, not the word.
6. `/word` gated the freshness line on `word !== ''` while the query enables on
   `word.trim().length > 0` — a whitespace headword showed "not fetched yet" plus a Refresh bound to a
   **disabled** query, i.e. a control advertising an action the page cannot take.
7. `new Date(ms).toISOString()` can throw for finite-but-out-of-range values, and the doc comment
   claimed the `title` was reachable by "hover/long-press" — it is mouse-hover only, so the comment
   now says the relative label is the single source of truth and the title is an extra.

Gate after the loop: `bun run typecheck` clean · **612 specs across 42 files** · warning-free build ·
CDP `ui-check` **48 route × viewport combinations, 0 defects** + theme assertion. Still a *joint*
number with the concurrent session (their uncommitted `csp.test.ts` is in it), and `/tmp` was reaped
mid-loop, killing the headless browser and the preview server — the harness had to be restarted.

**Not verified, stated plainly:** the POS dedupe and the pager default could not be seen in a browser
because the local preview deliberately shows the API-unreachable state; both are pinned by specs
against the captured payload instead of by eye. The word page's `entry not fetched yet · Refresh`
absent branch *was* confirmed in a screenshot.

## Fifth loop (2026-10-28) — the verification gap closed, then #5, #20 and #19 with measurements

**The harness first, because loop 4 ended with an admission.** `vite preview` proxies nothing, so every
data panel rendered its API-unreachable state and "verified in the browser" could only ever mean the
shell. A same-origin mock now serves the built bundle *and* answers `/api/v1/*` from fixtures
(`/home/peter/studio-probe/mock-server.mts`, outside the repo — the app still ships no mock layer, per
`AGENTS.md`): three instances on `:4181/:4182/:4183` for `auth_source = api-key | session | none`, and
anything unmocked 404s with a FastAPI-shaped `detail` so an unexercised path looks broken rather than
silently empty. That is what let this loop's claims be *seen* rather than asserted.

**#5 — row disclosure (candidate 5 from loop 3).** The review table truncated an object cell at 80 chars
and made the whole value reachable only through a native `title`, which is neither keyboard-reachable nor
hover-persistent (WCAG 1.4.13). `TruncatedValue` (now exported from `Review.tsx`) keeps the same prefix
and ellipsis and adds a real `type="button"` toggle with `aria-expanded` / `aria-controls` (the id is only
emitted while open, so it never points at a node that is not in the DOM); objects truncate at 80, scalars
at 120. Seven specs in the new `src/routes/Review.test.tsx` — including "the rendered markup contains no
`title=` at all", which is the guard against a future re-fall-back to the tooltip. **Seen in the browser:**
cell 97 chars + ellipsis + `aria-expanded=false` → click → 245 chars + `Show less` + `true`, on laptop and
at 390px, with zero titled cells and zero cells painting outside their track.

**Sign-out now says what it actually ends.** The footer consequence was one sentence for every identity;
an API-key session and a session cookie have different consequences (one clears a stored key plus cache,
the other ends a session and leaves the key alone), so `signInFooterEntry` now takes `authSource` and
`signOutConsequence()` branches on it. The same defect existed on `/login`: the password form carried a
**Sign out** button while the browser was holding an API key — a control promising to end a session that
was never started. It now renders only under `me.auth_source === 'session'`, pinned by a source guard in
`src/lib/signIn.test.ts` (the gate must wrap that one `onClick={leaveSession}`). Stale copy went with it:
Login's "there are no accounts" docstring and the key-card sentence, and `session.ts`'s header, which now
describes both credentials and says `signOutSession` leaves the stored key untouched.

**#20 (contrast) — measured, and the report was both overstated and understated.** Computed colours come
back as `oklch(...)`, so the probe resolves every fg/bg through a 1px canvas paint before doing the WCAG
math. A sweep of routes × viewports plus the mobile drawer (~850 leaf texts) found **no** text failure;
the auditor's two findings reproduced on the destructive alert, and there were **more** failures than
reported — the light theme failed too:

| surface | before (light) | before (dark) | after (light) | after (dark) |
|---|---|---|---|---|
| alert title | 4.21 | 5.14 | 5.13 | 5.14 |
| alert message | 4.02 | **4.46** | 5.13 | 5.14 |
| hint line | **3.38** | **3.37** | 5.13 | 5.14 |

Two stacked fades caused the dark pair (`text-destructive/90` on the description × `opacity-80` on the
hint), and a token that is simply too light caused the light set: at `oklch(0.577 0.245 27.325)` the
danger red could not reach 4.5:1 on its own tinted surface (4.21 at *full* alpha), so removing the fades
alone would not have fixed it. Same hue and chroma, lower lightness — `--destructive` is now
`oklch(0.52 0.23 27.325)` (`#cd0000`), which measures 5.13:1 on the surface and takes white text on a
solid `bg-destructive` fill from 4.77:1 to 5.84:1. The description uses the full token and the hint is
separated by its own line instead of by alpha. Every text box in both themes is now ≥ 4.53:1.

**What still fails, and stays:** the non-text chrome of the same alert — the tinted fill reads 1.14:1
(light) / 1.21:1 (dark) against the page and its border 1.6–2.1:1. That is the `--border:
oklch(1 0 0 / 10%)` class of finding, not a new one: raising a hairline to 3:1 (≈white/33%) restyles
every edge in the app to satisfy a reading of 1.4.11 that the surrounding text, the icon, and `role="alert"`
already carry. Recorded here as a deliberate design decision rather than silently kept or unilaterally
reverted.

**#19 (collapsed sidebar hides the page H1) — does not reproduce at rest.** Measured on the mock build:
the sticky bar bottoms out at 56px and `main h1` starts at 80px, a 24px gap, with the sidebar neither
scrolled nor overlapping. What *is* broken is that a navigation inherits the previous page's scroll
position, so the new page opens mid-scroll with its heading above the fold — and the only
`overflow-y-auto` in the shell is the sidebar's own nav list, so the **window** is the scroller and a
container scroll would have been a no-op. `AppShell` now resets `globalThis.window.scrollTo({ top: 0 })`
keyed to `location.pathname` alone (a `?limit=` bump is a control the user moved; it must not yank them
up). Verified: `/data` at `scrollY=549` → click `/links` → `scrollY=0`, h1 clear at 80px; a second nav to
`/review` also lands at 0. Two specs in `AppShell.test.tsx` pin the call *and* the dependency list.

**A regression this loop's own gate caught.** After the primitive-level touch-target work, `ui-check`
reported `/word/pasian` mobile page-size `Select` at 60×28 under `lg`: the vendored
`data-[size=sm]:h-7` (an attribute selector) outranks a route-level `max-lg:h-10` (a class), so the
override was dead code. Fixed where the rule belongs — `max-lg:min-h-10` on `ui/select.tsx`'s trigger,
`min-height` beating `height` regardless of specificity — and the inert class removed from `Word.tsx`.
Reminder worth keeping: **`ui-check` runs against `dist/`**, so a source fix is invisible to it until the
bundle is rebuilt.

Gate after the loop: `bun run typecheck` clean · **623 specs across 43 files** · warning-free build
(`dist` and the mock bundle) · CDP `ui-check` 48 route × viewport combinations, 0 defects.

## Sixth loop (2026-10-29) — lane A: one credential in play, and every sentence that forgot it

**The one bug, seen from eight surfaces.** The app has carried two credentials since accounts landed —
`X-API-Key` from `localStorage`, `Authorization: Bearer` from `sessionStorage` — and `lib/credentials.ts`
resolves them unambiguously: **session wins, else key, never both**. The copy, two controls, and one
sign-in path had not caught up. Each finding below is that lag from a different angle, which is why they
were fixed together: a sentence that names the wrong credential is the same defect as a button that ends
the wrong one.

**S1 — `signIn` stored a key underneath a live session, and the stored key was inert.** Because the
resolver prefers the session, the key sat in `localStorage` and was *never sent*: the tab looked signed in
with a key, kept sending the bearer token, and there was no UI path that revealed it. `signIn` now ends the
session it displaces (`setApiKey` first, then `await signOutSession()`, so a slow or failing logout can
never leave the tab holding nothing), which is the mirror of what `signInWithPassword` has always done to
the key. **Measured on the mock session origin (`:4182`)**: before — `{lsKey: null, ssSession: "present",
keyButtonAmber: true}`; after typing a key into the dialog and saving — `{lsKey: "zl_ab12fresh…",
ssSession: null, keyButtonTitle: "API key set (zl_a••••••0000)", keyButtonAmber: false}`. Two specs in
`session.test.ts`: the swap (asserting `getSession()` null, `resolveAuthHeader()` = api-key, and that a
`POST /auth/logout` actually went out with the bearer token) and the failure case (a logout that throws
keeps the key).

**The dialog was a second, quieter sign-in path.** `KeyDialog` verified the key and then called
`setApiKey` directly, so the *same* key saved from the dialog did not end a session while the same key
saved from `/login` did — two paths, one of which produced the S1 state by design. The dialog now awaits
`signIn(result.value)` and its own `resetQueries()` went with it (the reset belongs to the sign-in, not to
whichever widget triggered it). Three source guards in the new `KeyDialog.test.tsx` pin that
`setApiKey(` does not reappear there, because the regression is silent when it comes back.

**The key card's Sign out promised to end a session it never started.** `canLeaveKey`
(`me.auth_source === 'api-key' || (hasKey && me.auth_source !== 'session')`) now gates that button, and the
stored-key sentence below it branches on the same derivation instead of always claiming "signing out
removes it". Pinned by source guards in `signIn.test.ts`.

**The identity panel only existed for key holders.** `identitySummary` took `hasKey` as its reason to
render, so a tab that the server reports as an authenticated *account* saw no panel at all — the one case
where knowing your role matters most. The session branch is now independent of `hasKey` and names its
source. **Measured with only `zolai.session` seeded and `localStorage` cleared**: the panel renders
"Signed in · admin · Admin · founder — Full access…" over
`GET /auth/me — auth_source=session, so this role comes from the account, not from a key's scopes.`;
`signOutButtons` 2 on the password card (footer + card), 1 with the key card open — correctly, since there
is no key there to remove.

**Eight places told a session tab about a key it wasn't sending.** The worst was the top bar's
`title="No API key — public endpoints only"` on a tab that was authenticated as admin and reading every
panel; it is now a three-way title that says which credential is in play, and the amber "set a key" styling
appears only when there is genuinely no credential (`!hasKey && !sessionActive`). The 401 was the same
class of lie — "API key required", advising a paste that would not help an expired session — so
`ErrorState`'s 401 now reads *"Credential refused / The server refused the credential this request carried"*
with a hint that names both ways back in, and the 403 hint says "a credential without the scope". That
closes the item logged on 2026-10-18 under *Observed, deliberately not changed* (#3), via the copy-only
route that note itself proposed: `ApiError.needsKey` is still 401-only and `ErrorPanel` still cannot tell
the two causes apart — it just no longer guesses. The rest: `agentErrors.ts`'s 401 label, `api.ts`'s
fallback summary, `ApiKeysPanel`'s missing-scope line, `routes.ts`'s `/login` description, the AppShell and
Sidebar footnotes, and `authModeNotice`.

**A null that rendered as an ellipsis.** `metadataPreview` in `Word.tsx` tested `typeof value === 'object'`
first, and `typeof null === 'object'`, so every absent metadata field displayed `…` as though it held a
nested object — the exact "unknown rendered as something else" pattern this loop's honesty rule is about.
Found by the full suite (`Word.test.tsx` pins the scalar behaviour), not by a browser pass; the fix is
ordering, null before the object marker.

**Deliberately left, with reasons.** `agentErrors.ts`'s 403 and 429 copy still says "this key" / "per key"
— that may be exactly right (rate limits and scopes really are key-attached server-side), and the
difference between "the copy is wrong" and "the server means it" is a `zolai-core` question, which this
repo does not answer by editing prose. `api.ts`'s `[object Object]` and `Word.tsx`'s morphology over-claim
were both taken by the seventh loop. `DataTable`'s `hideBelow` columns (which drop data below a breakpoint
with no marker) remain unfixed and unclaimed.

Gate after the loop: `bun run typecheck` clean · **649 specs across 45 files** · both builds exit 0 and
warning-free · CDP `ui-check` **PASSED, no layout defects across 4 viewports** against
`http://127.0.0.1:4180`.

**Two honesty notes about this loop's own evidence.** (1) `scripts/ui-check.ts` defaults `STUDIO_URL` to
**the live site** — run it as `STUDIO_URL=http://127.0.0.1:4180 bun run scripts/ui-check.ts` or it will
grade a deployment instead of the tree, and pass or fail for reasons that have nothing to do with the
change under test. (2) **studio.zolai.space is behind the tree by loops 1–6.** Measured, not assumed: the
live CSS (`index-czohk7wD.css`) contains no `Cormorant`, no `--elevation-modal`, no `--destructive-surface`
where the local one does, and every change in this section is still uncommitted in the working tree, so the
deployed bundle cannot contain it. A deploy is owed. It has not been done, and will not be, unprompted.

## Seventh loop (2026-10-29) — a poll that can be stopped, two message defects, and the next two lanes researched

**#6 — pause auto-refresh.** `useHealth()` polled `/health` every 30s unconditionally; an operator pointed
at a wedged API paid that loop forever. The pause is a module-level store (`src/lib/healthPoll.ts`, the same
injectable-storage seam as `key.ts`) read through `useSyncExternalStore`, persisted under
`zolai.healthPollPaused`, and the query config is now a pure exported function
(`healthQueryOptions(paused)`) so a node-env spec can pin that paused maps to `refetchInterval: false` —
TanStack's off value, since `0` would be a runaway loop, not a stop. The control is a
`DropdownMenuCheckboxItem` in the ⋯ menu with `aria-checked`, so the state is readable on open rather than
inferred from a ticking bar. **Measured in the browser** (`:4183`, 900px, menu path): before —
`{stored: null, checked: "false", pill: "ok"}`; after — `{stored: "true", checked: "true", pill: "paused"}`
and **zero further `/health` requests over 35s** (resource entries 1 → 1); resuming — `{stored: null,
checked: "false", pill: "ok"}` and the next interval lands (2 → 3 over 33s). The pill says `paused` on its
face because the tooltip is not rendered until hover (1.4.13), and its age line ("checked 4 min ago") is
built from TanStack's real `dataUpdatedAt`, never a guess — `never checked` when there is no reading yet.

**Two defects in that work, caught by this loop's own verification.** (1) The paused pill still ran the
green `animate-ping` dot — a liveness animation on a stopped poll, which is precisely the "reads as live
while it is not" class this document keeps fixing. The ping is now gated on `!paused`; re-measured:
`{pill: "paused", ping: 0, spin: 0, icon: "lucide-pause"}`, pinned by an assertion in
`HealthPill.test.tsx`. (2) The store's catch-block comment claimed "the in-memory value still drives this
session", but a blocked write left the next read returning `false` — a pause button that silently resumes.
It now keeps a session mirror (and `__setStorageForTests` resets it, so no spec can inherit someone else's
pause); the spec that used to assert the degraded behaviour asserts the mirror instead.

**`[object Object]` in a 422.** FastAPI's `detail` array can carry items with no `msg` (the `json_invalid`
and `input`/`ctx` shapes), and the formatter fell through to `String(item)`. Such an item now renders as
`loc`-prefixed `key=value` pairs (`body.question: type=string_type input=42`), or a capped JSON fragment of
what remains (`query.limit: {"ctx":{"ge":1}}`), with a 120-char per-item cap inside the existing 300-char
message cap. A table of six `detail` shapes in `api.test.ts` each asserts its exact rendering *and*
`not.toContain('[object Object]')`.

**A morphology card that described the server instead of the response.** `Word.tsx` said the live endpoint
"returns {} for morphology" and labelled the card "empty on the live API" — claims about the deployment
that a single response cannot support. It now says "empty in this response", names `GET /word/{w}` as where
the data would have come from, and points at the Forms tab for surface forms. Worth recording: the tolerant
schema parses `morphology` as a `record` with `.catch({})`, so the component genuinely **cannot** tell
"field absent" from "present but empty" — the copy claims neither, and a source guard forbids the three old
strings from returning.

**The next two lanes were researched, not started.** Two read-only passes mapped candidate #3 (panel state
in the URL) and #4 (applied-filter chips) against this codebase. The URL finding: `react-router-dom` 7.18
is already there, `?collection=`/`?from=` already round-trip through pure codecs in `src/lib/routes.ts`,
and a node-env suite cannot unit-test hooks — so the fit is a hand-rolled, typed codec pair per panel (zero
new dependencies), not `nuqs` and not TanStack-Table state in the URL. Scope: `tab`/`table`/`q` for
`/review`, `tab` and the six `lim` values for Word, with **cursors deliberately excluded** (they are
`WHERE id > ?` positions over live data — a pasted stack is stale and unshareable) and unknown or
out-of-range values restored to the control's default with a visible notice rather than a silent reset. The
chips finding: `FilterChips` belongs in `src/components/` (not as an edit to the vendored `badge.tsx`),
with ✕ only on filters that have a real setter — `selectedTable` is load-bearing and must render
non-interactive — and "Clear all" only when there are ≥2 removable chips, never clearing the table. Both
are recorded below as the next lanes; neither is implemented.

**A nuance worth knowing about the pause at narrow widths.** Below `lg` the pill lives in the ⋯ menu, so
`useHealth()` is only mounted while that menu is open — the 30s poll has always run only in that window.
The pause control is therefore most meaningful on the wide bar, where the pill is always mounted. The
honest fix — hoisting the health observer into the shell so the poll runs regardless of the menu — is a
behaviour change of its own and is listed as a candidate below, not smuggled into this loop.

Gate after the loop: `bun run typecheck` clean · **673 specs across 47 files** · both builds exit 0 and
warning-free · CDP `ui-check` PASSED, no layout defects across 4 viewports against
`http://127.0.0.1:4180`.

## Eighth loop (2026-10-29) — the state you can paste, and the filter you can see

Two lanes from the seventh loop's research, run as parallel agents and then measured in the browser:
candidate #4's `/data` half (applied-filter chips) and candidate #3's Word half (panel state in the URL).
The review-queue half of both is **not** in this loop — see "Deliberately left" at the end.

**Applied-filter chips on `/data`.** The page explained its filter in prose — "Showing one collection from
the dashboard link:" plus a `Link` — so the applied state, the result count and the way out were three
sentences instead of one row of facts. `src/components/FilterChips.tsx` is a new composition (built from
`Badge` + `Button`, not an edit to the vendored `badge.tsx`): a chip carries `label` + `value`, the ✕ only
renders where a real setter exists, and `Collection: phrases` is removable because `?collection=` is what
made it true. `Showing: 1 of 6 collections` is **not** — there is no control that "shows all" from within
the collection view, so it renders as a plain outline badge rather than a button that would lie. "Clear
all" only appears with ≥2 removable chips and never clears the selected table. Removal is announced through
an always-mounted `<p role="status" className="sr-only">` (`Filter removed: Collection phrases`), and no
`title=` reaches the markup (WCAG 1.4.13). Measured at 4181: chip row read
`Collection: phrases Showing: 1 of 6 collections` over 1 row with `aria-label="Remove filter: Collection phrases"`;
one click gave `search: ""`, `Showing: 6 of 6 collections`, 6 rows; at 390px `documentElement.scrollWidth`
equalled `clientWidth` (`overflowX: 0`) — the chips wrap instead of pushing a horizontal page scroll.

**Word's tab and limits moved into the URL.** `wordPanelFromSearch` / `wordSearch` in `src/lib/routes.ts`
are pure codecs (the node suite cannot mount hooks), and `Word.tsx` now *derives* `tab` and the six
per-sub-resource limits from `useSearchParams` on every render rather than keeping a `useState` copy that
could drift. Writes go through `setSearchParams(..., { replace: true })`, so a tab click is a view change,
not a back-stack entry. Defaults are omitted from the built string — a pasted link that restates six
defaults is noise. Over-large values are clamped through `coerceWordLimit` (the endpoint registry's own
bounds) and the change is *reported* in a persistent warning `Notice` rather than applied silently.
Measured: pasting `/word/pasian?tab=evidence&limit_evidence=200` opened Evidence with the select reading
`200` and the request `GET /api/v1/word/pasian/evidence?limit=200`; `/word/pasian?limit_evidence=5000`
opened Contexts at the default and said `?limit_evidence=5000 exceeds the server cap; showing 200.`

**One defect found by verifying rather than by testing.** The first build used a packed
`limit=contexts:50,evidence:200` grammar and hand-composed the string specifically so a pasted link would
read `limit=evidence:200` instead of `limit=evidence%3A200`. The unit tests passed. The browser then showed
that the page writes through `setSearchParams`, which re-serializes through `URLSearchParams` and escapes
`:` and `,` anyway — so the readable form existed only for links *I* typed, and every link the *app*
produced went back to `%3A`. A real click on the Forms tab measured `?tab=forms&limit=evidence%3A200`. The
grammar is now one parameter per sub-resource (`?tab=forms&limit_evidence=200`), built through
`URLSearchParams` like everything else, using only characters that cannot be escaped. `routes.test.ts`
asserts the property directly — the built string must be byte-identical to `new URLSearchParams(built).toString()`
and must contain no `%XX` — so the encoder cannot silently undo the readability again. The clamp `Notice`
and the codec docs were re-worded to quote the parameter as it is actually written.

**Re-measured after the change**: a full `pointerdown/mousedown/pointerup/mouseup/click` sequence on the
Forms `[role="tab"]` gave `?tab=forms&limit_evidence=200` with `activeTab: "Forms"` and `historyDelta: 0`
— the tab moved, the limit survived untouched, nothing was pushed onto the stack. (Harness note:
`Session.click('text=…')` matches only `button, a[href], [role="button"], [role="switch"]`, so a Radix
`[role="tab"]` needs the explicit sequence — the earlier "the click did nothing" reading was the harness,
not the page.)

**Deliberately left.** `/review`'s `tab`/`table`/`q` and the review/audit chip + count restructure are the
riskier halves of #3/#4 and stay open; the cursor stack is excluded by design (a `WHERE id > ?` position
over live data is not shareable, and a pasted stack would show the operator rows that no longer exist).
`DataTable hideBelow` still has no visible marker of a column hidden at this width, and two `agentErrors`
strings still say "this key"/"per key" where a session may be in play.

**Harness notes learned this loop.** `scripts/ui-check.ts` defaults `STUDIO_URL` to the *live* site while
grading local `dist/` — always pass `STUDIO_URL=http://127.0.0.1:4180` after rebuilding. The mock bundle is
not a package script: `VITE_API_BASE=/api/v1 bunx vite build --outDir dist-mock --emptyOutDir`. The preview
server and the three mock APIs die with the headless Chrome instance, so restart all four together
(`:9222`, `:4180`–`:4183`); and `pkill -f mock-server.mts` matches the invoking shell's own command line and
kills this session — stop them by port owner (`ss -ltnpH "sport = :4181"`). `mock-server.mts` grew a dynamic
`/api/v1/word/{w}[/{sub}]` fixture this loop, because without it `/word` short-circuits on a 404 and every
URL-state probe measures an error screen.

Gate after the loop: `bun run typecheck` clean · **699 specs across 49 files** · both builds exit 0 and
warning-free · CDP `ui-check` PASSED (exit 0), no layout defects across 4 viewports against
`http://127.0.0.1:4180`.

**Still owed, and unchanged from the seventh loop:** `https://studio.zolai.space/` is behind this tree by
loops 1–8. No deploy has been made and none will be made unprompted.

## Ninth loop (2026-10-29) — the queue you can link to, the poll that never stops, the columns you can't see

Four lanes run as parallel agents, plus one I took myself, and every claim measured in the browser before it
was written here: **A** finished the review-queue halves of candidates #3 and #4, **B** closed #7 (health
poll hoisted into the shell), **C** added the hidden-column marker `DataTable` owed, **D** was a fresh
research/audit pass feeding loop 10, **E** (mine) made the last two credential sentences honest about a
session. Loop 8's "Deliberately left" list is now empty of everything except what loop 10 will pick up.

**A — `/review` state in the URL, and applied-filter chips.** `reviewPanelFromSearch` / `reviewSearch` sit
beside the Word codecs in `src/lib/routes.ts` with the same rules: pure functions (the node suite cannot
mount hooks), defaults omitted from the built string, `replace: true` on every write, and — pinned by a
property spec — a value grammar that survives `URLSearchParams` re-serialization unchanged. `tab` is a
closed set (`browse` / `audit`), `table` is validated against the records whitelist, `q` is free text trimmed
on read. The **cursor stack deliberately stayed in `useState`**, with a comment saying why: a `WHERE id > ?`
position over live data is not a view, and a pasted stack would show the operator rows that no longer exist.
Chips follow the `/data` vocabulary — `View` renders only when the tab is not browse, `Table` is always a
badge and removable only when it is not the default, `Filter` only when `q` has content, and the `Showing`
count is a non-interactive badge naming exactly the rows in the payload (no "of N" total, because the server
returns bare arrays). The request path left the heading and became Card subtitles
(`GET /records · limit 50 · page N`, `GET /audit · limit 50 · 24 fetched`); the empty states now point at
the chip ✕ rather than restating the filter. Measured at 4181: `?tab=audit` opened **Audit log**;
`?table=phrases` selected **trigger phrases** with 2 rows; the hostile `?q=hpa%20%26%20ran%23go%` decoded
into the input as `hpa & ran#go%`; typing that same string back wrote
`?q=hpa+%26+ran%23go%25` with `historyDelta: 0`; a link the *app* wrote round-tripped in a fresh tab as
`{q: true, table: true, rows: true}`; one click on the Audit tab gave `?tab=audit&q=…` (the filter survived
the view change); the Filter ✕ gave `?tab=audit`; "Clear all" gave `""` — which keeps `table` at its default
rather than dropping the required query, because `records.list` declares `requiredQuery: ['table']`; and
pagination was confirmed cursor-local: `next page: {"nextClicked":true,"beforeNext":"","afterNext":""}`.
Removal announced through the live region as `Filter removed: Filter hpa.`

**B — one health observer at the shell (#7).** `src/components/HealthObserver.tsx` is new and mounts once in
`AppShell.tsx`; `healthObserverSpec(paused)` is the *only* place in the app that sets a live
`refetchInterval`, and `healthDisplaySpec()` pins the pill's own fetch to `NO_INTERVAL` so the pill is a pure
display observer. Below `lg` that means what the seventh loop could not claim: the poll is continuous whether
or not the ⋯ menu is ever opened. Measured at 390px with the menu **never** opened — 1 `/health` request in
40s running, **0** while paused, 1 again after resume (`{"running":1,"paused":0,"resumed":1,"passes":true}`),
console errors `[]`. So "paused" now means paused at every width.

**C — the hidden-column marker.** `hiddenColumnsAt(specs, isHidden)` in `src/lib/datatable.ts` produces the
sentence, and `DataTable.tsx` reads it through `useSyncExternalStore` over `matchMedia` (with `globalThis`
guards, since the tests run in node) — so the marker is driven by the same queries that hide the columns, not
by a guess about the width. `HIDE_BELOW_MIN_WIDTH_REM` maps each tier to its breakpoint rem; a non-string
header falls back to the column `key`, never `[object Object]`. The text is inside the existing footer with an
aria-hidden dot and no `title=`. Measured: `5 columns hidden at this width: gloss, pos, frequency (+2 more)`
at 390px, `1 column hidden at this width: Group` on `/data`, and nothing at 768 or 1440. It says **at this
width**, because the data is in the response — only the column is not.

**E — sentences that assumed an API key.** `agentErrors.ts` said "Not allowed for this key", "this key
lacks a member+ role", and "Five runs per minute per key" on paths where a session may be the credential in
play (loop 6's own finding). All three now say *credential*, as does `Agent.tsx`'s rate-limit line, and
`agentErrors.test.ts` loops the three strings asserting none contains "key". Sweeping the same defect through
the prose found three more: the `/agent` run budget also read `5/min/key` in `Agent.tsx`'s own doc block, in
the doc comment in `features/agent/api.ts`, and — user-visible — in `endpoints.ts`'s note for the run
endpoint, which `/links` renders verbatim. All now say credential.

**Two guards were too broad, and that was a defect of its own.** The loop-7 source guards matched the bare
word `refetchInterval`, which meant a file could not *describe* its own behaviour without failing — a comment
mentioning the prop tripped them. Both `HealthPill.test.tsx` and `HealthObserver.test.tsx` now anchor to
`/refetchInterval\s*:/`, which is the thing actually forbidden (setting the prop), not the word.

**A crash the suite caught on the final gate — and the promise that turned out to be false.** Re-running the
gate after the docs pass put `AppShell.test.tsx` on **error instead of 6 passing specs**: `AuthBanner` read
`sessionStorage.getItem(...)` directly inside a `useState` initializer, so the shell's
`renderToStaticMarkup` died on `ReferenceError: sessionStorage is not defined`. That is the same class the
rest of the app already guards — `lib/key.ts`, `lib/sidebar.ts`, `lib/healthPoll.ts` and `lib/sessionAuth.ts`
each take a `StorageLike` and try/catch, because a hardened or partitioned browser blocks the store and the
shell must not go down with it. Fixed in `AuthBanner.tsx`: the read and write are now exported
`readDismissedMode(storage)` / `writeDismissedMode(storage, mode)` kernels with a single guarded
`sessionStorageLike()` accessor, and the mute decision is a named `bannerMuted(stored, mode)`.
`AuthBanner.test.tsx` is new (12 specs) and covers the three store states — absent, throwing, working — plus
the second defect the rewrite exposed: the banner's own doc block promised that *"a mode flip re-shows it"*,
while the code stored a blanket `'1'` for the session. Dismissing the warn notice then silenced every future
auth notice in that tab, including the one the flip would produce. The slot is
`zolai.authBannerDismissedMode` and stores **the mode that was muted**, so `bannerMuted('warn', 'enforce')`
is false and the notice comes back — asserted, not narrated. Two smaller rules went in the same file's last
describe: the dismiss control carries no native `title=` and grows to a 40px target below `lg`
(`size-8 max-lg:size-10`), per the repo's own touch-target convention.
Measured on a fourth mock (`:4184`, `AUTH_MODE=warn AUTH_SOURCE=none` — the only fixture combination where the
notice renders at all, which is why this banner had never been seen in a browser): at 390px it showed with
`dismissSize {w: 40, h: 40}` and `overflowX: 0`; the ✕ stored `"warn"` and the notice went away; a reload kept
it away; then storing `enforce` under the same slot — standing in for the server's mode changing, since the
mock cannot change its answer mid-run — brought the notice back, which is the promise the blanket flag broke.
No console errors. Harness note: `AUTH_MODE` is a new knob in `mock-server.mts` and defaults to the old `rag`
value, so the loop 6–8 credential probes are unaffected.

**New defect found by the probes, not yet fixed.** At viewport **753** the `/data` page reports
`overflowX: 3` (`scrollWidth 756` against a 753 client): the TopBar's right-hand cluster
(`div.flex min-w-0 shrink items-center gap-1 sm:gap-2`) cannot shrink the icon-only **Sign out** button
enough, and the sweep names it exactly — one hit, `tag: button`, empty text, `w: 40`, `right: 756`, depth 7.
So the header, not the content, drives a horizontal page scroll at a width where the page itself fits. Looped into the tenth pass.

**Lane D's output — loop 10's backlog**, each entry re-read in the file it names before being recorded (two of
the lane's line references were off and are corrected in place — see "New candidates" below): recoverable
content still behind native `title=` on five surfaces, `Word.tsx`'s bespoke `hideBelow="lg"` silently dropping
the ZO Tedim 2010 variant below `lg`, a raw `error.message` on `Contribute.tsx` announced twice, empties that
name no endpoint, a run with no address of its own, and the `md`-only tier cliff on the records table.

Gate after the loop: `bun run typecheck` clean · **757 specs across 52 files** · `bun run build` and the mock
build both exit 0 and warning-free · CDP `ui-check` **PASSED** (exit 0), no layout defects across 4 viewports
against `http://127.0.0.1:4180`.

**Still owed, and unchanged:** `https://studio.zolai.space/` is behind this tree by loops 1–9. No deploy has
been made and none will be made unprompted.

## Tenth loop (2026-10-29/30) — the six candidates, and the checker that could not see two of them

Five lanes ran as parallel agents (**A** recoverable content out of native `title=`, **B** `Word.tsx`'s
bespoke `hideBelow`, **C** honest empties and the double-announced Contribute error, **D** the `md`-only
column tier + `TruncatedValue`, **E** the agent run's address) and two more were dispatched mid-loop when
measurement contradicted the reports (**F** sidebar tooltips, **H** `DataFreshness`/`HealthPill` tooltips).
#12 and the shell half of #8 I took myself, because both turned out to be defects of the *harness*, not of
any one component. Every number below is from the headless-browser probes against the mock at `:4185`
(`dist-mock`, `/api/v1` fixtures, synthetic key `sk-aaaa…2222`), not from a lane's own report.

**The two claims measurement disproved.** Lanes A–E reported #8 and #12 closed. The sweep found **21–22
native `title=` attributes still on screen per page** — all of them in the shell, which no lane owned (14
sidebar nav descriptions, the collapse toggle, sign-out ×2, palette, theme, ⋯, both credential controls, the
freshness timestamp) — and the header overflow reproduced **5 times out of 5** at 768 (3px, `Sign out`) and
at 1024 (38px, the sign-in anchor at 222px), on every route. A fix that is reported before it is measured is
how nine loops of "fixed" kept coming back, so both went round again.

**#12 — the tiers stopped being breakpoints.** The cause is not the cluster, it is what the cluster is
measured against. A media query answers for `innerWidth`, which includes the 15px vertical-scrollbar gutter
and, worse, is the width *before* the `lg` sidebar that appears in the same query has taken its 239px:

| viewport | bar has | sidebar takes | `md`/`lg` promised | overflow |
|---|---|---|---|---|
| 768 | 753 | — | 753 | **3px** |
| 1024 | 1009 − 239 = 769 | 239 | 1009 | **38px** |
| 1280 | 1265 − 239 = 1025 | 239 | — | 0 |

`src/components/AppShell.tsx` now declares the content column as a query container (`@container`) and
`TopBar.tsx` keys every tier to it: **480px** brings the theme toggle inline, **820px** the palette trigger +
the key and identity labels, **1020px** the health pill, the role badge and the key prefix — and the ⋯ menu
retires at that same 1020px, so the palette is never stranded between the two forms. Measured after the
change, anonymous *and* with an admin key stored (the widest identity cluster), on `/`, `/data`, `/review`,
`/word/pasian`, `/agent`: **`documentElement.scrollWidth − clientWidth` = 0 at every one of the 36 width/route
combinations** (360…1600), and each cluster reports `fits=true` — e.g. at a 1024px viewport the bar is 769px,
carries 166px of controls, and the palette lives in the ⋯ menu; at 1280 it is 1025px and carries 558px inline
with the pill back. `innerWidth` was never the right number and for nine loops the checker used it.

**The checker was the second defect.** `scripts/ui-check.ts` measured "does it fit" against
`window.innerWidth` (`:62`), so a control that stuck out past the *client* edge but not past the gutter still
passed — which is precisely how a 3px and a 38px page-level horizontal scrollbar survived nine consecutive
green `ui-check` runs. It reads `document.documentElement.clientWidth` now, keeps `innerWidth` for exactly one
job (the touch-target floor, because `max-lg:` really does match the viewport), and the two measured failure
widths are named in `VIEWPORTS` (`lg-edge` 1024, `just-past-lg` 1100) alongside the 768 that broke.

**#8 — the shell pass.** Lanes F and H cleared the sidebar, `DataFreshness` and `HealthPill`; the rest is
mine: the collapse toggle's `title` became an `aria-label` that contains its visible word ("Collapse", so
2.5.3 still holds) and now names itself when icon-only; `CommandPaletteTrigger`'s `title` became
`aria-label="Open the command palette"`, which is also its only name in the icon-only tier; the key control,
the identity control, the ⋯ trigger and `ThemeToggle` lost theirs — each keeps an `sr-only` companion under
the 820px tier, so the accessible name exists at every width and the state is one click away in the menu that
opens. Measured: **0 `title=` attributes on all 13 routes** at 1280, where 21–22 were counted at the start of
the loop. What replaced the two credential tooltips is the thing they were trying to be: the amber tone, the
visible label, `AuthBanner` when the credential changes what you can reach, and the dialog the button opens.

**A guard that can fail on purpose.** Nine loops of per-component tooltip fixes kept re-growing the defect
elsewhere, so `src/components/no-native-title.test.ts` is new: it walks every `.ts`/`.tsx` under `src`
(vendored `ui/` excluded), strips comments — three of the sidebar's `title=` hits are prose *about* removed
tooltips — and fails on any `title=` handed to a lowercase DOM tag, while staying quiet on `<Card title=…>`
and `<Button title=…>`, which are props that render visibly. It carries its own positive control (`<button
title="Expand">` must be caught) because a detector that matches nothing also passes nothing's absence.

**#11 — a run now has an address.** `?run=412` (`AGENT_RUN_PARAM`, digits only, in `src/lib/routes.ts`
with `agentRunFromSearch`/`agentSearch`), read through `useSearchParams` and never mirrored into `useState`.
Chosen because `setSearchParams` re-serializes through `URLSearchParams`: digits are the one value space that
cannot be escaped, and the **goal stays out of the address** — a sentence the operator typed is not a
parameter, and a pasted URL must not be able to start a run. Pinned by a spec that slices the codec out of
`routes.ts` and asserts it sets exactly one key. Writes with the default **push** — a run is a record the
operator asked for, not a view change (`/review` and `/word` pass `replace: true`; a source guard asserts
`setSearchParams` gets no second argument here). `live.data ?? (run.data.id === runId ? run.data : undefined)`
means a pasted `?run=99` reads from the server instead of showing the tab's last run, and `CopyValue
value={runLink(run.id)}` puts the link on the run card. Measured: submit → `?run=412`; `?run=413` then `?run=412`
then **back** → `?run=413` (each run is a step in history); the 600ms read is caught mid-flight as
`#413 · loading`; an unknown id settles on the error state whose copy now reads
`GET /api/v1/agent/runs/999 — the id came from the link, not from a run started in this tab`. Console errors
`[]`. The copy-link affordance is asserted in source only — the probe's text selector did not find the value
rendered, which is a gap in the measurement, not evidence of absence.

**#10 verified as written.** With the form filled and the server answering FastAPI's 422 detail array, the
inline notice reads `body.word: Field required; body.source: String should have at least 3 characters Your
contribution was not recorded — fix the details and submit again.` and the toast is the short one
("Submission failed — see the notice above the form"), so the same sentence is no longer announced twice.
The earlier `Contribute` probe attempt "failed" because it typed into the wrong placeholders — a probe bug,
fixed by targeting `#contrib-word` / `#contrib-suggested` / `#contrib-source`.

**#9 verified, and the first reading of it was wrong.** The ZO Tedim 2010 variant is present and visible at
390, 753 and 1425; `hideBelow` no longer exists on `Paragraph` at all. My first pass called it unfixed because
the probe compared `innerText` against `'ZO Tedim 2010'` and the CSS `uppercase` transform makes Chrome report
`ZO TEDIM 2010`. Case-insensitive comparison found it. Same trap as loop 8's `#9`: the probe's own assumption
is the least tested part of any measurement.

**Visible-path convention (new, found while writing #11's copy).** `documentedPath(id, params)` is exported
from `src/lib/endpoints.ts` (`API_PREFIX + endpointPath`, one literal for both it and `publicPath`) and every
*prose* site now uses it: `Agent.tsx` ×3 and `Assistant.tsx` ×4. They had been contradicting each other —
the Agent panel printed `GET /agent/runs/999` while Dashboard and Search printed `/api/v1/...` for the same
calls, because registry templates are relative to `API_BASE`. Transports keep `endpointPath`; a drift guard in
`endpoints.test.ts` fails if a visible `POST ${endpointPath(` reappears, and the measured copy now prints
`POST /api/v1/agent/runs · budget 65s client / 60s server` on an empty `/agent`.

Gate after the loop: `bun run typecheck` clean · **822 vitest specs across 58 files** (all
green, measured 2026-10-30) · `bun run build` and the mock build both
exit 0 and warning-free.

**Still owed, and unchanged:** `https://studio.zolai.space/` is behind this tree by loops 1–10. No deploy has
been made and none will be made unprompted.

## Candidates not yet taken (from the 2026-10-26 research pass)

Ordered by value to an operator. **1 and 2 were taken by the third loop above, 5 by the fifth, 6 by the
seventh; 3 and 4 were completed by the eighth (Word, `/data`) and the ninth (review queue); 7 was taken by
the ninth.** The entries below the line are the ninth loop's research pass and are loop 10's backlog.
3. ~~**Panel state in the URL**~~ — **complete.** Word by the eighth loop, `/review` by the ninth
   (`?tab=` / `?table=` / `?q=` through the same pure codecs, replace-not-push, cursor stack excluded by
   design). The grammar rule the eighth loop learned the hard way still governs both: every character in a
   written value must survive `URLSearchParams` re-serialization, or the app's own links stop being readable.
   *Plan for any further surface:* hand-rolled codecs in `src/lib/routes.ts` (the existing pattern, zero new
   deps), invalid or out-of-range values fall back to the control's default **with a visible notice**, never
   a silent reset.
4. ~~**Applied-filter chips**~~ — **complete.** `/data` by the eighth loop, `/review` by the ninth (View /
   Table / Filter chips, ✕ only on real setters, `Showing` non-interactive because the server returns bare
   arrays, "Clear all" keeps the required `table` at its default, removal announced via `role="status"`).
5. ~~**Row disclosure**~~ — taken by the fifth loop: `TruncatedValue` in `Review.tsx`, with the
   native `title` gone and a spec asserting no `title=` reaches the markup.
6. ~~**Pause-auto-refresh**~~ — taken by the seventh loop: a persisted pause store, `aria-checked` in
   the ⋯ menu, a pill that says `paused` on its face with no liveness animation, and measured zero
   `/health` requests while paused.
7. ~~**Hoist the health observer into the shell**~~ — taken by the ninth loop: `HealthObserver.tsx` mounted
   once in `AppShell.tsx` is the only live `refetchInterval` in the app, the pill is display-only, and the
   30s poll was measured running, stopped, and running again at 390px **without the ⋯ menu ever opening**.

### New candidates — the ninth loop's research pass (loop 10)

Every reference below was re-read in the file before being recorded; two from the research lane's raw output
pointed at the wrong line and are corrected here.

8. **Recoverable content still behind native `title=`** — WCAG 1.4.13: hover-only, no keyboard route, no way
   to dismiss, and nothing at all on touch. Genuine losses (the fact exists *only* in the tooltip):
   `Rag.tsx:164-168` — the fixed snippet count is visible ("10 — fixed by the server") but the reason it is
   fixed is tooltip-only; `ProviderModelSelect.tsx:236, 250, 274` — each button's required role ("any role",
   "admin, settings:write") is tooltip-only; `TopBar.tsx:214-225` — which credential is in play, the exact
   thing loop 6 made the app careful about; `Orchestra.tsx:723` — a truncated cell whose full value is
   tooltip-only, though the fifth loop's `TruncatedValue` exists for precisely this; `Sidebar.tsx:245` — with
   the rail collapsed the GitHub link is icon-only, so its destination is tooltip-only. Redundant rather than
   lost: `Links.tsx:231, 239` repeat a path the element already displays. *Plan:* `TruncatedValue`-style
   click-to-expand for cell content, and visible subtext (or an `sr-only` line plus an on-page statement) for
   the permission and credential notes — not a new tooltip component, which would only replace one hover
   dependency with another.
9. **`Word.tsx:633` drops the ZO Tedim 2010 variant below `lg` with nothing saying so** — the
   parallel-contexts card is `grid gap-2 lg:grid-cols-3`, so below `lg` a bespoke `hideBelow="lg"` removes the
   third `Paragraph` even though the grid has just collapsed to one column and no layout pressure remains;
   the row reads as EN + TDB77 only. It is not a `DataTable` column, so lane C's footer marker does not reach
   it. *Plan:* stop hiding it, or state plainly that a third variant is not shown at this width.
10. **Errors that are raw, and empties that name no address** — `Contribute.tsx:236-243` passes
    `error.message` straight through (from an `ApiError` *or* any `Error`) and announces it twice, once inline
    via `setResult` and once as a toast. `Dashboard.tsx:219-222`'s empty claims "The versioned surface may
    require an API key" — a statement about the server that one empty response cannot support, in key
    language that outlived loop 6. `Search.tsx:246-255` and `Agent.tsx:193-196` describe the action to take
    but never the endpoint they asked, which is this app's own rule for empty panels. *Plan:*
    `failureDetail(error)` for the copy, one announcement per event, and every empty naming its endpoint and
    the single control that would change the answer.
11. **A run has no address** — `Agent.tsx:115` keeps `runId` in `useState`, so run #412 is unlinkable, lost on
    reload, and cannot be handed to a colleague; the id appears in the Card subtitle and nowhere in the URL.
    This is candidate #3's technique applied to a record instead of a view, and the obvious next step now that
    the codecs exist.
12. **TopBar overflows `/data` by 3px at viewport 753** — measured this loop: the icon-only **Sign out**
    button inside `div.flex min-w-0 shrink items-center gap-1 sm:gap-2` will not shrink enough, so the header
    — not the content — drives a horizontal page scroll.
13. **`Review.tsx:426` hides behind a single `md` tier** — `hideBelow: key === columnKeys[0] ? undefined :
    'md'` gives every records column the same cliff, while the audit table beside it (lines 675-713) already
    grades `sm`/`md`/`lg`/`xl`. Lane C now *labels* the cliff; this is the place left where the tier choice
    itself is still crude.

Deliberately **not** candidates (rejected on the record): undo after revoke/demote (the server
has no un-revoke and no role command, so "Undo" would advertise a capability that does not
exist), deltas and sparklines (no history endpoint), sticky headers, tightening tolerant schemas.

## Deliberate behaviours (do not "fix")

- **The review queue's cursor stack stays out of the URL** (`Review.tsx` keeps it in `useState`, with a
  comment saying so). A `WHERE id > ?` position over live data is not a view: pasting someone's stack would
  show rows that no longer exist, and "page 3" of a cursor stream is not page 3 for anybody else. The
  shareable parts — `tab`, `table`, `q` — are all in the address.
- **The `Showing` chip on `/review` names payload rows and nothing else.** No "of N": `records.list` and
  `audit.list` return bare arrays, so any total the client printed would be invented.
- **Source guards match `refetchInterval\s*:`, not the bare word** (`HealthPill.test.tsx`,
  `HealthObserver.test.tsx`). The ninth loop found the looser pattern failing on a *doc comment* that
  described the file's own behaviour — forbidding a word in prose is not forbidding the behaviour, and it
  punishes the file for explaining itself.

- **Word's limit grammar is one parameter per sub-resource** (`?tab=forms&limit_evidence=200`), not the
  packed `limit=contexts:50,evidence:200` it first shipped with. The page writes through
  `setSearchParams` → `URLSearchParams`, which escapes `:` and `,`; a compacted grammar produces the link
  the app writes (`%3A`) rather than the one a person reads. `routes.test.ts` fails if the built string
  ever differs from its own `URLSearchParams` round-trip.

- **Sticky table headers were rejected**: the `overflow-x-auto` container is a scroll container,
  so `position: sticky` on `<thead>` silently does nothing — the honest pattern is the scroll-fade.
- **No sparklines/deltas in stat tiles**: they would fabricate history the API does not return.
- **`schemas.ts` collapses missing numbers to `0`** (`z.number().catch(0)`), which is mandated
  tolerant-by-design behaviour for the live API — but it means a component *cannot* distinguish
  "absent" from "zero" for those fields (Orchestra overview tiles inherit real-looking zeros).
  The display-layer `?? 0` → `—` fixes help only where the schema passes `undefined` through; a
  full fix needs the schema to `.catch(undefined)`/`nullableNum` per-field, which touches every
  consumer. `AgentPhaseSchema.evidence_count` has now made that move (null renders `—`); the rest
  are left as a known limitation. **`Word.tsx`'s morphology card is the same collapse in object form**
  (`z.record(...).catch({})`): the component cannot tell "field absent" from "present but empty", so
  its empty copy says only "empty in this response" and claims nothing about the server.
- **Toast classifiers are one kernel with one deliberate exception**: `Agent.tsx` still routes
  524/429/403 and the client-timeout case through its own tested `failedTitle`/`failedDetail`
  pair before falling back to the shared classifier — that delegation is pinned by tests and
  stays. Every other toast in the app now takes `failureDetail(error)` (message + hint as one
  line), so no surface echoes a raw exception.
- **`agentErrors.ts` keeps its own sanitised fallback string** rather than importing
  `describeError`, because `lib/` must not depend on a component file; the two sentences are
  checked against each other by hand, not by a test.
- **Emerald/amber literal chips** remain in `HealthPill` (status dots) and `Word`/`Links` tag
  rows — deliberate status language, not drift.

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
3. **~~A 401 on the users panel still reads "API key required"~~** — **fixed 2026-10-29** by the sixth
   loop, via the copy-only route this note proposed: the 401 now reads "Credential refused" and the hint
   names both ways back in. `ApiError.needsKey` is still 401-only by contract and `ErrorPanel` still
   cannot tell an expired session from a revoked key — it just no longer guesses which one happened.
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
