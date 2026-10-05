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
 *   - `commands.ts` builds `ROUTE_COMMANDS` (`nav-{id}` ids, same paths);
 *   - `PARAM_VARIANTS` covers deep links with a path parameter.
 *
 * `minRole` is the same value `<RequireRole minimum>` gates on, and it comes from
 * the **server** — see `src/lib/auth.ts`. Never derive a role from the stored key.
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
    keywords: 'login sign in api key credential auth session',
    nav: false,
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

/** The sign-in path, referenced by the gate prompt and the warn-mode banner. */
export const LOGIN_PATH: RoutePath = '/login'

export function routeById(id: string): RouteSpec | undefined {
  return ROUTES.find((route) => route.id === id)
}

export function routeByPath(path: string): RouteSpec | undefined {
  return ROUTES.find((route) => route.path === path)
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
 */
export function collectionPath(label: string): string {
  return `/data?collection=${encodeURIComponent(label)}`
}

/** The `?collection=` value carried by `collectionPath`, or `''` when absent. */
export function collectionFromSearch(search: string | URLSearchParams): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  return (params.get('collection') ?? '').trim()
}