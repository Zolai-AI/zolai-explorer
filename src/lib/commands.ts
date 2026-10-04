/**
 * Command-palette (⌘K) action model.
 *
 * The *data* lives here, free of React and the DOM, so `commands.test.ts` can
 * assert that every route in the app is reachable from the palette and that the
 * headword action builds a valid `/word/{word}` path. `CommandPalette.tsx`
 * attaches the icons and the handlers.
 *
 * Icons are deliberately not part of the spec: this module must stay importable
 * in the plain-Node vitest environment.
 */

import { wordFieldSchema, wordPath } from './forms'
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
}

export const COMMAND_GROUP_NAV = 'Navigate'
export const COMMAND_GROUP_ACTIONS = 'Actions'
export const COMMAND_GROUP_APPEARANCE = 'Appearance'

/** One entry per routed page — kept in sync with `NAV_ITEMS` in Sidebar.tsx. */
export const ROUTE_COMMANDS: readonly CommandActionSpec[] = [
  {
    id: 'nav-dashboard',
    kind: 'navigate',
    label: 'Dashboard',
    group: COMMAND_GROUP_NAV,
    keywords: 'dashboard home totals health statistics',
    hint: '/',
    to: '/',
  },
  {
    id: 'nav-word',
    kind: 'navigate',
    label: 'Word explorer',
    group: COMMAND_GROUP_NAV,
    keywords: 'word headword entry lexicon',
    hint: '/word',
    to: '/word',
  },
  {
    id: 'nav-analyze',
    kind: 'navigate',
    label: 'Analyze text',
    group: COMMAND_GROUP_NAV,
    keywords: 'analyze sentence paragraph tokenise segment',
    hint: '/analyze',
    to: '/analyze',
  },
  {
    id: 'nav-search',
    kind: 'navigate',
    label: 'Corpus search',
    group: COMMAND_GROUP_NAV,
    keywords: 'search retrieval query',
    hint: '/search',
    to: '/search',
  },
  {
    id: 'nav-rag',
    kind: 'navigate',
    label: 'RAG retrieval',
    group: COMMAND_GROUP_NAV,
    keywords: 'rag retrieval augmented snippets',
    hint: '/rag',
    to: '/rag',
  },
  {
    id: 'nav-data',
    kind: 'navigate',
    label: 'Data and service',
    group: COMMAND_GROUP_NAV,
    keywords: 'data statistics collections version',
    hint: '/data',
    to: '/data',
  },
  {
    id: 'nav-links',
    kind: 'navigate',
    label: 'Links',
    group: COMMAND_GROUP_NAV,
    keywords: 'links docs metrics review api surface',
    hint: '/links',
    to: '/links',
  },
]

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
