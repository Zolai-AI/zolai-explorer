/**
 * Command-palette (⌘K) action model.
 *
 * The *data* lives here, free of the DOM, so `src/lib/auth.test.ts` can assert
 * that every route in the app is reachable from the palette, that the role
 * filter hides gated destinations, and that the headword action builds a valid
 * `/word/{word}` path. `CommandPalette.tsx` attaches the icons and handlers.
 *
 * Icons are deliberately not part of the spec. The one React-adjacent import is
 * `can` from `./auth` — a pure function that happens to live next to the
 * `useRole()` hook — so this module still imports and runs in the plain-Node
 * vitest environment.
 *
 * Route commands come from the registry's **palette** set (`PALETTE_ROUTES`), not
 * from the sidebar's nav list: the two are different rendering choices, and
 * conflating them is what made sign-in undiscoverable from ⌘K.
 */

import { wordFieldSchema, wordPath } from './forms'
import { can, type Role } from './auth'
import { PALETTE_ROUTES, type RouteSpec } from './routes'
import type { Theme } from './theme'

export type CommandKind = 'navigate' | 'theme' | 'api-key' | 'word'

export type CommandActionSpec = {
  /** Stable id — also the React key and the `cmdk` value. */
  id: string
  kind: CommandKind
  /** What the user reads in the list. */
  label: string
  /** `cmdk` group heading; also used as the group filter string. */
  group: string
  /** Extra search terms `cmdk` matches on. */
  keywords: string
  /** Short hint rendered on the right (routes only). */
  hint?: string
  /** `navigate` only — the router path. */
  to?: string
  /** `theme` only — the preference to apply. */
  theme?: Theme
  /** `navigate` only — minimum role for the destination (default: anonymous). */
  minRole?: Role
}

export const COMMAND_GROUP_NAV = 'Navigate'
export const COMMAND_GROUP_ACTIONS = 'Actions'
export const COMMAND_GROUP_APPEARANCE = 'Appearance'

/**
 * One `navigate` command per record, generated from the registry — the `nav-{id}`
 * ids are stable because the registry ids are.
 *
 * Takes the records as an argument so the *flag* is provable: a test can pass a
 * registry with `palette` flipped and watch membership change, instead of trusting
 * that the palette list is derived from the same records the sidebar reads.
 */
export function routeCommandsFor(
  routes: readonly RouteSpec[],
): readonly CommandActionSpec[] {
  return routes.map((route) => ({
    id: `nav-${route.id}`,
    kind: 'navigate' as const,
    label: route.label,
    group: COMMAND_GROUP_NAV,
    keywords: route.keywords,
    hint: route.path,
    to: route.path,
    minRole: route.minRole,
  }))
}

/**
 * Palette route commands.
 *
 * `PALETTE_ROUTES`, not `NAV_ROUTES`: the sidebar's primary list is a *rendering*
 * choice, and reading it here is what made ⌘K inherit the same blind spot as the
 * sidebar — `/login` was reachable, but nothing offered it. Sign-in therefore
 * opts in through the registry's `palette` flag, and this module never names a
 * route id.
 */
export const ROUTE_COMMANDS: readonly CommandActionSpec[] = routeCommandsFor(PALETTE_ROUTES)

export const THEME_COMMANDS: readonly CommandActionSpec[] = [
  {
    id: 'theme-system',
    kind: 'theme',
    label: 'Theme: follow the system',
    group: COMMAND_GROUP_APPEARANCE,
    keywords: 'theme system auto os preference',
    theme: 'system',
  },
  {
    id: 'theme-light',
    kind: 'theme',
    label: 'Theme: light',
    group: COMMAND_GROUP_APPEARANCE,
    keywords: 'theme light white day',
    theme: 'light',
  },
  {
    id: 'theme-dark',
    kind: 'theme',
    label: 'Theme: dark',
    group: COMMAND_GROUP_APPEARANCE,
    keywords: 'theme dark night',
    theme: 'dark',
  },
]

export const API_KEY_COMMAND: CommandActionSpec = {
  id: 'action-api-key',
  kind: 'api-key',
  label: 'Set or replace the API key…',
  group: COMMAND_GROUP_ACTIONS,
  keywords: 'api key credential auth token secret',
}

export const LOOKUP_COMMAND: CommandActionSpec = {
  id: 'action-look-up-word',
  kind: 'word',
  label: 'Look up a word…',
  group: COMMAND_GROUP_ACTIONS,
  keywords: 'look up word headword goto navigate',
}

/** Full palette, in render order. */
export const COMMAND_ACTIONS: readonly CommandActionSpec[] = [
  ...ROUTE_COMMANDS,
  LOOKUP_COMMAND,
  API_KEY_COMMAND,
  ...THEME_COMMANDS,
]

/** Action ids in render order — used as the `cmdk` `value`s. */
export const COMMAND_ACTION_IDS: readonly string[] = COMMAND_ACTIONS.map((action) => action.id)

/**
 * Role filter for the palette. Mirrors the Sidebar rule: a command with a
 * `minRole` only renders when the reported role meets it, so the palette can
 * never jump to a route the shell would prompt on.
 */
export function filterCommands(
  actions: readonly CommandActionSpec[],
  role: Role,
): CommandActionSpec[] {
  return actions.filter((action) => can(role, action.minRole ?? 'anonymous'))
}

/**
 * Validate the headword typed into the palette's lookup step.
 * Returns `{ ok: false, issues }` so the dialog can render the same inline error
 * the Word route shows.
 */
export function resolveCommandLookup(
  input: unknown,
): { ok: true; value: { word: string; path: string } } | { ok: false; issues: string[] } {
  const result = wordFieldSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => issue.message || 'Invalid word.'),
    }
  }
  const word = result.data.toLowerCase().replace(/\s+/g, ' ').trim()
  if (word === '') return { ok: false, issues: ['Enter a word to explore, e.g. pasian.'] }
  return { ok: true, value: { word, path: wordPath(word) } }
}
