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

import type { Role } from './schemas'

/** Icon key — `Sidebar.tsx` owns the lucide mapping. */
export type RouteIconName =
  | 'gauge'
  | 'book'
  | 'scan'
  | 'search'
  | 'message'
  | 'bot'
  | 'database'
  | 'link'
  | 'settings'
  | 'key'
  | 'file-text'

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
    description: 'Verify an API key, replace or clear the stored one',
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
    keywords: 'word headword entry lexicon forms contexts collocations patterns evidence',
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
