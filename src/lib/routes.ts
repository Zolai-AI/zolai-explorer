/**
 * The route registry — **one** list for the router, the sidebar, the command
 * palette and the role gate.
 *
 * Before this file the navigation existed four times over: `<Route>` elements in
 * `App.tsx`, `NAV_ITEMS` in `Sidebar.tsx`, `ROUTE_COMMANDS` in `commands.ts`, and
 * a `/word/:word` deep link that no test tied to anything. Nothing caught a
 * renamed or removed destination, which is how "cards that do nothing" and
 * gated pages you could not reach both shipped.
 *
 * Everything now derives from `ROUTES`:
 *   - `App.tsx` renders `<Route>`s from it (`PAGES` is keyed by `RoutePath`, so a
 *     new path without a component is a compile error);
 *   - `Sidebar.tsx` maps `icon` → a lucide component (`Record` over `RouteIconName`,
 *     so a missing icon is a compile error too);
 *   - `commands.ts` builds `ROUTE_COMMANDS` (`nav-{id}` ids, same paths) from
 *     `PALETTE_ROUTES` — primary nav plus the records flagged `palette: true`,
 *     which is how sign-in stays in ⌘K without sitting in the sidebar's nav list;
 *   - `PARAM_VARIANTS` covers deep links with a path parameter.
 *
 * `specOf(id)` reads a whole record by id (path, icon, description) for the shell
 * surfaces that render the sign-in control, so no component hand-types `'/login'`.
 *
 * `minRole` is the same value `<RequireRole minimum>` gates on, and it comes from
 * the **server** — see `src/lib/auth.ts`. Never derive a role from the stored key.
 * `gateMinimum()` is what `App.tsx` reads, so the router cannot hold a second
 * copy of a role that disagrees with this file.
 */

import {
  WORD_SUB_RESOURCES,
  coerceWordLimit,
  defaultWordLimit,
  wordLimitChoices,
  type WordSubResource,
} from '../features/word/api'
import { RECORDS_WHITELIST, type TableName } from '../features/review/api'
import type { Role } from './schemas'

/** Icon key — `Sidebar.tsx` owns the lucide mapping. */
export type RouteIconName =
  | 'gauge'
  | 'book'
  | 'scan'
  | 'search'
  | 'message'
  | 'bot'
  | 'network'
  | 'database'
  | 'link'
  | 'settings'
  | 'key'
  | 'file-text'
  | 'shield-check'

export type RouteSpec = {
  /** Stable id. The command palette exposes these as `nav-{id}`. */
  id: string
  /** Router path relative to the app root; `/` is the index route. */
  path: string
  /** Sidebar / palette label. */
  label: string
  /** One line describing the panel (sidebar tooltip, mobile sheet header). */
  description: string
  /** Minimum server role for the destination. */
  minRole: Role
  icon: RouteIconName
  /** Extra search terms the palette matches on. */
  keywords: string
  /**
   * `false` for a destination that must be reachable but must not sit in the
   * primary navigation — `/login` is the only one today (it is what the gate
   * prompt and the warn-mode banner link to).
   */
  nav: boolean
  /**
   * `true` when the record belongs in the ⌘K palette **even though** `nav` is
   * `false`. Primary-nav records are in the palette by definition, so this flag
   * only has to name the exceptions.
   *
   * It exists because `nav: false` silently removed `/login` from ⌘K as well as
   * from the sidebar: the destination existed, was reachable, and was offered
   * by nothing but a gate prompt — "there is no admin login on Studio". The
   * flag keeps the two lists independent, still one registry, no second
   * hand-written id list in `commands.ts`.
   */
  palette?: boolean
}

/**
 * Every destination in the app.
 *
 * `minRole` mirrors the server: `/agent` needs member, `/settings` needs admin,
 * the rest are anonymous-safe.
 */
export const ROUTES = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    description: 'Knowledge totals and service health',
    minRole: 'anonymous',
    icon: 'gauge',
    keywords: 'dashboard home totals health statistics',
    nav: true,
  },
  {
    id: 'login',
    path: '/login',
    label: 'Sign in',
    description: 'Sign in with a key or an account, replace or clear the stored credential',
    minRole: 'anonymous',
    icon: 'key',
    keywords: 'login sign in api key credential auth session sign out logout username password',
    nav: false,
    // Not primary navigation (it is a footer/top-bar control, not a workbench)
    // but always discoverable: it must be reachable by ⌘K, by the sidebar
    // footer and from the top bar, for every role, before any key is held.
    palette: true,
  },
  {
    id: 'word',
    path: '/word',
    label: 'Word',
    description: 'Word entry with sub-resources',
    minRole: 'anonymous',
    icon: 'book',
    keywords: 'word headword entry lexicon forms contexts collocations patterns evidence related',
    nav: true,
  },
  {
    id: 'analyze',
    path: '/analyze',
    label: 'Analyze',
    description: 'Sentence and paragraph analysis',
    minRole: 'anonymous',
    icon: 'scan',
    keywords: 'analyze sentence paragraph tokenise segment',
    nav: true,
  },
  {
    id: 'search',
    path: '/search',
    label: 'Search',
    description: 'Cross-corpus retrieval',
    minRole: 'anonymous',
    icon: 'search',
    keywords: 'search retrieval query',
    nav: true,
  },
  {
    id: 'rag',
    path: '/rag',
    label: 'RAG',
    description: 'Retrieval-augmented snippets',
    minRole: 'anonymous',
    icon: 'message',
    keywords: 'rag retrieval augmented snippets',
    nav: true,
  },
  {
    id: 'assistant',
    path: '/assistant',
    label: 'Assistant',
    description: 'Retrieval-grounded chat',
    minRole: 'anonymous',
    icon: 'message',
    keywords: 'assistant chat conversation retrieval citations',
    nav: true,
  },
  {
    id: 'agent',
    path: '/agent',
    label: 'Agent',
    description: 'Goal-driven research runs',
    minRole: 'member',
    icon: 'bot',
    keywords: 'agent run goal research build review shipped',
    nav: true,
  },
  {
    // Public on purpose: every read the page renders (`/learning/overview`,
    // `/learning/agents`, `/learning/skills`) is unauthenticated on the server,
    // and the admin writes behind it are gated inline on the reported role — so
    // the page itself must be reachable without a key or the read-only view is
    // invisible to exactly the people it is built for.
    id: 'orchestra',
    path: '/orchestra',
    label: 'Orchestra',
    description: 'Learning agents, tasks and assistant assignments',
    minRole: 'anonymous',
    icon: 'network',
    keywords: 'orchestra agents skills learning run task bindings assistants team translate grammar vocabulary collocations',
    nav: true,
  },
  {
    id: 'data',
    path: '/data',
    label: 'Data',
    description: 'Statistics and knowledge version',
    minRole: 'anonymous',
    icon: 'database',
    keywords: 'data statistics collections version',
    nav: true,
  },
  {
    id: 'links',
    path: '/links',
    label: 'Links',
    description: 'External API surface',
    minRole: 'anonymous',
    icon: 'link',
    keywords: 'links docs metrics review api surface',
    nav: true,
  },
  {
    id: 'review',
    path: '/review',
    label: 'Review',
    description: 'Record correction queue with audit trail',
    minRole: 'member',
    icon: 'file-text',
    keywords: 'review correction audit record queue edit dataset',
    nav: true,
  },
  {
    id: 'contribute',
    path: '/contribute',
    label: 'Contribute',
    description: 'Submit new words, meanings, usage examples, and corrections',
    minRole: 'anonymous',
    icon: 'file-text',
    keywords: 'contribute submit word meaning usage correction suggestion dictionary',
    nav: true,
  },
  {
    // `member`, not `superadmin`, even though the *queue* is a superadmin surface:
    // the ask is what the page is for, and an item hidden below superadmin is an
    // ask nobody holding `admin` could find. One page, two halves, each rendered
    // on the role the **server** reported — `RequireRole` gets the member minimum
    // from this record and the queue section gates itself on `can(role, 'superadmin')`.
    id: 'requests',
    path: '/requests',
    label: 'Requests',
    description: 'Ask for a role, and decide the queue',
    minRole: 'member',
    icon: 'shield-check',
    keywords: 'requests role admin superadmin approve reject queue ask promote contribution attribution',
    nav: true,
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    description: 'AI provider catalog and API keys (admin)',
    minRole: 'admin',
    icon: 'settings',
    keywords: 'settings providers admin ai model key activate api keys rotate revoke',
    nav: true,
  },
] as const satisfies readonly RouteSpec[]

/** Union of every registry path — the key type for the router's element map. */
export type RoutePath = (typeof ROUTES)[number]['path']

/** Union of every registry id. */
export type RouteId = (typeof ROUTES)[number]['id']

/** Destinations that belong in the sidebar / palette, in render order. */
export const NAV_ROUTES = ROUTES.filter((route) => route.nav)

/**
 * Widened view of the registry.
 *
 * `ROUTES` is an `as const` tuple so `RoutePath`/`RouteId` stay literal types
 * (that is what keys the router's `PAGES` map). Reading *optional* fields off
 * the union itself is therefore a compile error, so helpers iterate this
 * `RouteSpec`-typed view of the very same records.
 */
export const ROUTE_REGISTRY: readonly RouteSpec[] = ROUTES

/**
 * Whether a record belongs in the ⌘K palette.
 *
 * Primary navigation is in the palette by definition; a record that is
 * deliberately out of the nav list opts back in with `palette: true`. The
 * palette therefore reads *the same records* as the sidebar and can never need a
 * hand-written id list to find `/login`.
 */
export function inPalette(spec: RouteSpec): boolean {
  return spec.nav || spec.palette === true
}

/** Destinations the ⌘K palette offers: primary nav plus every flagged record. */
export const PALETTE_ROUTES: readonly RouteSpec[] = ROUTE_REGISTRY.filter(inPalette)

/** The sign-in path, referenced by the gate prompt and the warn-mode banner. */
export const LOGIN_PATH: RoutePath = '/login'

/** The index path — `/` is unique to the dashboard, so it is safe to name. */
export const DASHBOARD_PATH: RoutePath = '/'

/** Registry path by id — the source every in-app destination is read from. */
const ROUTE_PATHS = Object.fromEntries(ROUTES.map((route) => [route.id, route.path])) as Record<
  RouteId,
  RoutePath
>

/**
 * Registry path by id.
 *
 * Every in-app link, redirect and `===` comparison reads a destination through
 * this (or through `collectionPath` / `signInPath` / `wordPath`) instead of
 * typing a path literal. A renamed registry record therefore cannot leave a
 * hand-typed `'/settings'` behind to 404 in silence —
 * `routes.test.ts` fails the build on any such literal.
 *
 * The map is typed over `RouteId`, which `as const` above derives from the
 * records themselves: an unknown id is a *compile* error, not an `undefined`
 * rendered as a broken `to`.
 */
export function pathOf(id: RouteId): RoutePath {
  return ROUTE_PATHS[id]
}

/**
 * Registry record by id.
 *
 * `routeById` takes a plain string and answers `undefined` for an unknown id;
 * this one is typed over `RouteId`, so the id is checked at compile time and the
 * answer is always a record. The top bar, the sidebar footer and the ⌘K palette
 * read the sign-in control through it — a shell that named `'/login'` by hand
 * would 404 in silence after a rename.
 */
export function specOf(id: RouteId): RouteSpec {
  return ROUTE_REGISTRY.find((route) => route.id === id) as RouteSpec
}

export function routeById(id: string): RouteSpec | undefined {
  return ROUTES.find((route) => route.id === id)
}

export function routeByPath(path: string): RouteSpec | undefined {
  return ROUTES.find((route) => route.path === path)
}

/**
 * The minimum role a destination gates on, or `undefined` when it is
 * anonymous-safe and needs no gate at all.
 *
 * `App.tsx` renders `<RequireRole minimum={gateMinimum(spec)}>` from this, so a
 * registry record is the only place a role is written down: routing, the sidebar,
 * the palette and the gate cannot drift apart. An unknown path also yields
 * `undefined`, which keeps `NotFound` from being dressed up as a role prompt.
 */
export function gateMinimum(spec: RouteSpec | undefined): Role | undefined {
  return spec && spec.minRole !== 'anonymous' ? spec.minRole : undefined
}

/**
 * Deep links that add a path parameter to a registry path (`/word/pasian`).
 *
 * They render the same panel, so each variant names the registry path it
 * belongs to — `App.tsx` cannot silently point a deep link at the wrong page.
 */
export const PARAM_VARIANTS = [
  { pattern: '/word/:word', of: '/word' },
] as const satisfies readonly { pattern: string; of: RoutePath }[]

export type ParamVariantPath = (typeof PARAM_VARIANTS)[number]['pattern']

/** The registry path a deep-link pattern belongs to. */
export function routePathForVariant(pattern: string): RoutePath | undefined {
  return PARAM_VARIANTS.find((variant) => variant.pattern === pattern)?.of
}

/** Sign-in link that returns the user to where they were. */
export function signInPath(from?: string): string {
  return from && from !== LOGIN_PATH ? `${LOGIN_PATH}?from=${encodeURIComponent(from)}` : LOGIN_PATH
}

/**
 * Where a dashboard collection tile links: the Data page, pre-filtered to that
 * collection. Keeps the tile honest — it opens the page that actually owns the
 * number instead of looking tappable and doing nothing.
 *
 * The `/data` prefix comes from the registry, so renaming the Data route moves
 * the tile with it.
 */
export function collectionPath(label: string): string {
  return `${pathOf('data')}?collection=${encodeURIComponent(label)}`
}

/** The `?collection=` value carried by `collectionPath`, or `''` when absent. */
export function collectionFromSearch(search: string | URLSearchParams): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  return (params.get('collection') ?? '').trim()
}

/**
 * A word deep link (`/word/pasian`) — the `/word/:word` variant with the
 * headword URL-encoded, so a headword holding `/` or `?` cannot escape its
 * segment or inject a query string.
 */
export function wordPath(word: string): string {
  return `${pathOf('word')}/${encodeURIComponent(word)}`
}

/**
 * Where a redirect may land: a same-origin absolute path or nothing.
 *
 * `?from=` is attacker-controllable, so a hostile value (`https://evil.example`,
 * `//evil.example`, a path with a newline) must never reach `navigate()` or
 * `pushState` — it would throw, and an external URL would be an open redirect.
 * Anything that is not a single-slash-prefixed, newline-free path falls back to
 * the dashboard.
 */
export function safeReturnPath(candidate: string | null | undefined): string {
  if (!candidate) return DASHBOARD_PATH
  const trimmed = candidate.trim()
  if (!trimmed.startsWith('/')) return DASHBOARD_PATH
  if (trimmed.startsWith('//')) return DASHBOARD_PATH
  if (/[\r\n\t]/.test(trimmed)) return DASHBOARD_PATH
  return trimmed
}

/**
 * The Word panel's state, encoded in the query string.
 *
 * The tab and the six server-side `limit` values used to live only in
 * `useState`, so "the evidence tab at 200 rows" could not be pasted to a
 * colleague and a reload dropped it. These codecs are pure — the node test
 * suite cannot mount hooks, and the page derives its state from the URL on
 * every render rather than keeping a second copy that could drift.
 *
 * Decoding clamps through `coerceWordLimit` (the endpoint registry's bounds),
 * so a hostile `?limit_evidence=500000` can never 422; the change is *reported*
 * in `clamped` so the page can say the URL asked for something else instead of
 * silently showing a different number.
 */

/** The tab `/word/{w}` opens with when the URL does not name one. */
export const DEFAULT_WORD_TAB: WordSubResource = 'contexts'

/**
 * One value the decoder changed on its way to the server.
 *
 * `cap` means the server bound lowered it (`evidence` 200, `related` 50, the
 * rest 100); `choice` means it parsed but is not a size the page offers.
 */
export type WordLimitClamp = {
  sub: WordSubResource
  /** The integer the URL asked for. */
  requested: number
  /** The value actually sent as `limit`. */
  applied: number
  reason: 'cap' | 'choice'
}

export type WordPanelState = {
  /** The named tab, or `undefined` for absent/unknown — the caller keeps its default. */
  tab?: WordSubResource
  /** Only the sub-resources the URL names; an empty record means no overrides. */
  limits: Partial<Record<WordSubResource, number>>
  /** Every value the decoder changed, in `WORD_SUB_RESOURCES` order. */
  clamped: WordLimitClamp[]
}

/** Whether a raw string is one of the six sub-resource keys. */
function isWordSubResource(value: string): value is WordSubResource {
  return WORD_SUB_RESOURCES.some((resource) => resource.key === value)
}

/** The query parameter carrying one sub-resource's `limit`: `limit_evidence=200`. */
const wordLimitParam = (sub: WordSubResource): string => `limit_${sub}`

/**
 * Decode `?tab=` / `?limit_evidence=200` into panel state.
 *
 * Unknown sub-resource keys and malformed values are dropped rather than
 * guessed at; an absent or unknown `tab` stays `undefined`. Repeated
 * parameters follow `URLSearchParams` order — the last one wins.
 */
export function wordPanelFromSearch(search: string | URLSearchParams): WordPanelState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search

  const rawTab = (params.get('tab') ?? '').trim()
  const tab = isWordSubResource(rawTab) ? rawTab : undefined

  const limits: Partial<Record<WordSubResource, number>> = {}
  const clamped: WordLimitClamp[] = []

  for (const resource of WORD_SUB_RESOURCES) {
    // Digits only: `5abc`, `-5` and an empty value are malformed, not limits.
    const raw = params.getAll(wordLimitParam(resource.key)).at(-1)?.trim()
    if (raw === undefined || !/^\d+$/.test(raw)) continue
    const requested = Number.parseInt(raw, 10)
    if (!Number.isFinite(requested)) continue

    const sub = resource.key
    const applied = coerceWordLimit(requested, sub)
    limits[sub] = applied
    if (applied === requested) continue
    // The largest offered choice is the server's documented cap for the tab,
    // so a value above it was lowered by the bound, not rejected as a size the
    // page does not offer.
    const cap = Math.max(...wordLimitChoices(sub))
    clamped.push({ sub, requested, applied, reason: requested > cap ? 'cap' : 'choice' })
  }

  return { tab, limits, clamped }
}

/**
 * Build the minimal query string for a Word panel.
 *
 * Defaults are omitted (`tab=contexts`, and any limit equal to its tab's
 * default) because a URL that restates every default is noise in a pasted
 * link.
 */
export function wordSearch({
  tab,
  limits = {},
}: {
  tab?: WordSubResource
  limits?: Partial<Record<WordSubResource, number>>
} = {}): string {
  const params = new URLSearchParams()
  if (tab !== undefined && tab !== DEFAULT_WORD_TAB) params.set('tab', tab)
  for (const resource of WORD_SUB_RESOURCES) {
    const value = limits[resource.key]
    if (value === undefined || !Number.isFinite(value)) continue
    if (value === defaultWordLimit(resource.key)) continue
    params.set(wordLimitParam(resource.key), String(value))
  }
  // One parameter per sub-resource, named and valued from closed sets, because
  // the page writes through `setSearchParams`, which re-serializes through
  // `URLSearchParams` and escapes everything outside `A-Za-z0-9*._-`. A packed
  // `limit=evidence:200` therefore reached the address bar as
  // `limit=evidence%3A200` — decodable, but no longer the link a person reads.
  return params.toString()
}

/**
 * The review queue's state, encoded in the query string.
 *
 * The same defect as the Word panel: the tab, the table and the text filter
 * lived only in `useState`, so "the audit log for `phrases` filtered to `hiam`"
 * could not be pasted to a colleague and a reload dropped it. These codecs are
 * pure (the node suite cannot mount hooks) and the page derives its state from
 * the URL on every render instead of holding a second copy that could drift.
 *
 * **What is deliberately left out: the cursor.** `Review.tsx` keeps the
 * `WHERE id > ?` stack in local state and the cursor stack is not in the URL —
 * a cursor is a position into *live* rows, so a pasted one is stale the moment
 * the queue moves, and it would hand a colleague page 4 of a result set that no
 * longer exists. The filter is shareable; the walk through it is not.
 *
 * Grammar — the rule the Word codecs established: one parameter per fact
 * (`?tab=audit&table=phrases&q=hiam`), names and values drawn only from closed
 * sets of `[a-z_]`, and defaults omitted so a pasted link stays short. `q` is
 * the one exception, because it is free text an operator typed: it is built
 * through `URLSearchParams`, which escapes `&`, `#`, `:` and `%` correctly, and
 * read back with `getAll(...).at(-1)` — never hand-concatenated.
 */

/** The tabs the queue offers — the only values `?tab=` accepts. */
export const REVIEW_TABS = ['browse', 'audit'] as const

export type ReviewTab = (typeof REVIEW_TABS)[number]

/** The view `/review` opens with when the URL does not name one. */
export const DEFAULT_REVIEW_TAB: ReviewTab = 'browse'

/**
 * The table `/review` browses when the URL does not name one.
 *
 * It is never `undefined`: `records.list` declares `requiredQuery: ['table']`,
 * so a URL that cleared the table would ask the API for a table it refuses to
 * guess. "Clear all" resets to this value rather than removing it.
 */
export const DEFAULT_REVIEW_TABLE: TableName = 'dictionary'

export type ReviewPanelState = {
  /** The named tab, or `undefined` for absent/unknown — the caller keeps its default. */
  tab?: ReviewTab
  /** The named table, or `undefined` for absent/unknown — the caller keeps its default. */
  table?: TableName
  /** The operator's filter exactly as the URL carries it; `''` when there is none. */
  q: string
}

/** Whether a raw string is one of the queue's tab keys. */
function isReviewTab(value: string): value is ReviewTab {
  return REVIEW_TABS.some((tab) => tab === value)
}

/** Whether a raw string is one of the server's whitelisted tables. */
function isTableName(value: string): value is TableName {
  return RECORDS_WHITELIST.some((table) => table === value)
}

/**
 * The last occurrence of a key, or `''`.
 *
 * Repeated parameters follow `URLSearchParams` order and the last one wins —
 * the same rule the Word limits decoder applies, so a link that carries both
 * `?table=dictionary&table=phrases` resolves to one table rather than either.
 */
function lastSearchValue(params: URLSearchParams, key: string): string {
  return params.getAll(key).at(-1) ?? ''
}

/**
 * Decode `?tab=` / `?table=` / `?q=` into queue state.
 *
 * A value outside the closed sets is dropped rather than guessed at, so a
 * hand-edited `?table=secret_table` falls back to the page's default instead of
 * sending a table the server 400s on. An unknown `tab` stays `undefined`.
 */
export function reviewPanelFromSearch(search: string | URLSearchParams): ReviewPanelState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search

  const tab = lastSearchValue(params, 'tab')
  const table = lastSearchValue(params, 'table')

  return {
    tab: isReviewTab(tab) ? tab : undefined,
    table: isTableName(table) ? table : undefined,
    // Returned exactly as the URL carries it. The URL only ever holds the
    // trimmed form, because the builder trims; the transport trims again on the
    // way to the wire (`recordsPath`), so nothing here depends on that.
    q: lastSearchValue(params, 'q'),
  }
}

/**
 * Build the minimal query string for the review queue.
 *
 * Defaults are omitted (`tab=browse`, `table=dictionary`) and so is a blank or
 * whitespace-only filter, because a URL that restates every default is noise in
 * a pasted link. The filter is stored trimmed — the trimmed form is what the
 * transport actually sends, so the link states the request that was made.
 */
export function reviewSearch({
  tab,
  table,
  q,
}: {
  tab?: ReviewTab
  table?: TableName
  q?: string
} = {}): string {
  const params = new URLSearchParams()
  if (tab !== undefined && tab !== DEFAULT_REVIEW_TAB) params.set('tab', tab)
  if (table !== undefined && table !== DEFAULT_REVIEW_TABLE) params.set('table', table)
  if (q !== undefined && q.trim() !== '') params.set('q', q.trim())
  return params.toString()
}

/**
 * One agent run's address: `?run=412`.
 *
 * The review and Word codecs put a *view* in the URL; this puts a **record**
 * there. `Agent.tsx` held the id in `useState`, so a finished run was
 * unshareable and vanished on reload — the operator could describe "run #412"
 * but could not link it. The goal is deliberately **not** encoded: it is an
 * input, not a view, and a paragraph of prose in an address bar is noise (and a
 * pasted goal invites running it again by accident).
 *
 * Grammar — digits only, so the serializer cannot touch it: `run` is the one
 * parameter whose whole value space is `[0-9]+`, which is exactly the set
 * `URLSearchParams` leaves unescaped.
 */
export const AGENT_RUN_PARAM = 'run'
/**
 * The run id the URL asks for, or `null` for absent/unparseable.
 *
 * Last occurrence wins, as everywhere else here. `?run=0` and `?run=-3` are
 * `null` rather than an id: `useAgentRun` treats `<= 0` as "no query", so the
 * page falls back to its own empty state instead of fetching a run the server
 * cannot have.
 */
export function agentRunFromSearch(search: string | URLSearchParams): number | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const raw = lastSearchValue(params, AGENT_RUN_PARAM).trim()
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return id > 0 ? id : null
}

/** `run=412`, or `''` when there is no run to point at. */
export function agentSearch(runId: number | null | undefined): string {
  if (runId === null || runId === undefined || runId <= 0) return ''
  const params = new URLSearchParams()
  params.set(AGENT_RUN_PARAM, String(runId))
  return params.toString()
}
