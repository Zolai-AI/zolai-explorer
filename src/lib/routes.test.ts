import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WORD_SUB_RESOURCES, defaultWordLimit } from '../features/word/api'
import { RECORDS_WHITELIST } from '../features/review/api'
import { ROLES } from './auth'
import { ROUTE_COMMANDS } from './commands'
import {
  AGENT_RUN_PARAM,
  DASHBOARD_PATH,
  DEFAULT_REVIEW_TAB,
  DEFAULT_REVIEW_TABLE,
  DEFAULT_WORD_TAB,
  LOGIN_PATH,
  NAV_ROUTES,
  PALETTE_ROUTES,
  PARAM_VARIANTS,
  REVIEW_TABS,
  ROUTES,
  ROUTE_REGISTRY,
  agentRunFromSearch,
  agentSearch,
  collectionFromSearch,
  collectionPath,
  gateMinimum,
  inPalette,
  pathOf,
  reviewPanelFromSearch,
  reviewSearch,
  routeById,
  routeByPath,
  routePathForVariant,
  safeReturnPath,
  signInPath,
  specOf,
  wordPanelFromSearch,
  wordPath,
  wordSearch,
  type RouteIconName,
} from './routes'
import { SIGN_IN_SURFACES } from './signIn'

/** The router source — read so a second copy of a role cannot hide in it. */
const APP_SOURCE = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8')

/**
 * The shell surfaces sign-in has to be discoverable from. Read as source because
 * the Node test environment has no DOM: a component that stops rendering the
 * affordance is invisible to `renderToString`, and the founder-facing symptom
 * ("there is no admin login on Studio") is exactly a rendering regression.
 */
const SURFACE_SOURCES = {
  'components/TopBar.tsx': readFileSync(fileURLToPath(new URL('../components/TopBar.tsx', import.meta.url)), 'utf8'),
  'components/Sidebar.tsx': readFileSync(fileURLToPath(new URL('../components/Sidebar.tsx', import.meta.url)), 'utf8'),
  'components/CommandPalette.tsx': readFileSync(
    fileURLToPath(new URL('../components/CommandPalette.tsx', import.meta.url)),
    'utf8',
  ),
  'lib/commands.ts': readFileSync(fileURLToPath(new URL('./commands.ts', import.meta.url)), 'utf8'),
} as const

/**
 * `App.tsx` with its comments stripped: prose must neither fail nor satisfy a
 * code guard. (`App.tsx` holds no URL literal, so the `//` rule cannot eat a
 * string value.)
 */
const APP_CODE = APP_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * The Word page, read as source for the same reason as the shell surfaces: a
 * node-env suite cannot mount it, so a regression back to `useState` for the
 * panel state would be invisible to every renderer test.
 */
const WORD_CODE = codeOf(
  readFileSync(fileURLToPath(new URL('../routes/Word.tsx', import.meta.url)), 'utf8'),
)

/** `<RequireRole minimum="admin">` — a gate written out instead of derived. */
const LITERAL_GATE = /<RequireRole\b[^>]*minimum\s*=\s*["']/

/** A bare role name in quotes, anywhere in the router. */
const ROLE_LITERAL = /['"](anonymous|member|admin)['"]/

/** Every icon key must exist in the sidebar's lucide map (a `Record`). */
const ICONS: RouteIconName[] = [
  'gauge',
  'book',
  'scan',
  'search',
  'message',
  'bot',
  'network',
  'database',
  'link',
  'settings',
  'key',
  'file-text',
  'shield-check',
]

/** `<name> />` — a panel rendered by the router's `PAGES` map. */
const PAGE_ENTRY = /^ {2}'[^']*': <[A-Za-z]+ \/>,\n?/gm

/** `'/word': <Word />,` — one key of the router's panel map. */
const PAGE_KEY = /^ {2}'([^']*)': <[A-Za-z]+ \/>,/gm

/** `src/`, so the guard below can walk the files that render a destination. */
const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Every `.ts`/`.tsx` source under `dir`, excluding the test files. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourcesUnder(full)
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return []
    return [full.slice(SRC_ROOT.length)]
  })
}

/**
 * Files allowed to name a destination by hand.
 *
 * `lib/routes.ts` is the registry itself; `lib/endpoints.ts` holds **API** paths
 * (`/search`, `/rag` there mean `/api/v1/search`), which are a different
 * namespace and have their own literal guard in `endpoints.test.ts`.
 */
const ROUTE_LITERAL_EXEMPT = new Set(['lib/routes.ts', 'lib/endpoints.ts'])

const LINK_SOURCES = ['routes', 'components', 'features']
  .flatMap((dir) => sourcesUnder(join(SRC_ROOT, dir)))
  .filter((file) => !ROUTE_LITERAL_EXEMPT.has(file))

/**
 * A destination **bound** to a link or a redirect: `to={…}`, `to: …`,
 * `href=…`, `navigate(…)`, `redirect(…)`.
 *
 * This is the defect MINOR-6 closed — a `Link to="/settings"` beside a registry
 * that renamed the route, which renders fine and 404s on click. Matching the
 * binding (not the bare string) keeps prose like `` `/health` `` in a sentence
 * from tripping the guard, and `api/` stays out because `/api/v1` paths belong
 * to the endpoint registry and are guarded in `endpoints.test.ts`.
 */
const PATH_BINDING = /\b(?:to|href|navigate|redirect)\s*[:=(]\s*\{?\s*(['"`])\/(?!api\/)[A-Za-z][^'"`\n]*\1/g

/** Every hand-typed destination found in a source, as the matched text. */
function pathLiterals(source: string): string[] {
  return [...codeOf(source).matchAll(PATH_BINDING)].map((match) => match[0])
}

/** Comment-stripped source — prose must neither fail nor satisfy a guard. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('route registry integrity', () => {
  it('has a unique id and a unique path per record', () => {
    expect(ROUTES.map((r) => r.id).length).toBe(new Set(ROUTES.map((r) => r.id)).size)
    expect(ROUTES.map((r) => r.path).length).toBe(new Set(ROUTES.map((r) => r.path)).size)
  })

  it('starts every path with a slash and keeps / unique to the dashboard', () => {
    for (const route of ROUTES) expect(route.path.startsWith('/'), route.id).toBe(true)
    expect(ROUTES.filter((route) => route.path === '/')).toHaveLength(1)
  })

  it('declares a label, description, icon and a known role for every record', () => {
    for (const route of ROUTES) {
      expect(route.label.length, route.id).toBeGreaterThan(1)
      expect(route.description.length, route.id).toBeGreaterThan(5)
      expect(ICONS, route.id).toContain(route.icon)
      expect(ROLES, route.id).toContain(route.minRole)
      expect(route.keywords.length, route.id).toBeGreaterThan(3)
    }
  })

  it('keeps exactly one non-nav destination — the sign-in page', () => {
    const hidden = ROUTES.filter((route) => !route.nav)
    expect(hidden.map((route) => route.path)).toEqual([LOGIN_PATH])
    // It must be reachable *before* any privilege is held, or it is a chicken-and-egg trap.
    expect(routeByPath(LOGIN_PATH)?.minRole).toBe('anonymous')
  })

  it('opts that one non-nav destination into ⌘K with the registry `palette` flag', () => {
    // The defect this closes: `nav: false` also removed sign-in from the palette,
    // so the destination existed but nothing offered it outside a gate prompt.
    const hidden = ROUTE_REGISTRY.filter((route) => !route.nav)
    expect(hidden).toHaveLength(1)
    expect(hidden[0].palette).toBe(true)
    expect(inPalette(hidden[0])).toBe(true)
  })

  it('lets no nav record carry the flag — it exists to name the exceptions only', () => {
    expect(ROUTE_REGISTRY.filter((route) => route.nav && route.palette !== undefined)).toEqual([])
    for (const route of NAV_ROUTES) expect(inPalette(route), route.id).toBe(true)
  })

  it('is reachable through the lookup helpers', () => {
    expect(routeById('settings')?.path).toBe('/settings')
    expect(routeByPath('/word')?.id).toBe('word')
    expect(routeByPath('/nope')).toBeUndefined()
  })
})

describe('router / sidebar / palette read the same records', () => {
  it('the palette exposes exactly one command per palette route, nav plus the flagged ones', () => {
    expect(PALETTE_ROUTES.length).toBe(NAV_ROUTES.length + 1)
    expect(ROUTE_COMMANDS.length).toBe(PALETTE_ROUTES.length)
    for (const route of PALETTE_ROUTES) {
      const command = ROUTE_COMMANDS.find((c) => c.id === `nav-${route.id}`)
      expect(command, route.id).toBeDefined()
      expect(command?.to).toBe(route.path)
      expect(command?.minRole).toBe(route.minRole)
    }
  })

  it('keeps nav and palette distinct: only the flagged non-nav record is added', () => {
    // One extra command, and it is sign-in — not a sidebar list that leaked into ⌘K.
    const extra = ROUTE_COMMANDS.filter((c) => !NAV_ROUTES.some((route) => `nav-${route.id}` === c.id))
    expect(extra.map((c) => c.id)).toEqual(['nav-login'])
  })

  it('keeps the palette ids and paths unique', () => {
    const ids = ROUTE_COMMANDS.map((c) => c.id)
    const paths = ROUTE_COMMANDS.map((c) => c.to)
    expect(ids.length).toBe(new Set(ids).size)
    expect(paths.length).toBe(new Set(paths).size)
  })

  it('covers every routed page the app has, including sign-in', () => {
    const paths = ROUTES.map((route) => route.path)
    for (const path of [
      '/',
      '/login',
      '/word',
      '/analyze',
      '/search',
      '/rag',
      '/assistant',
      '/agent',
      '/data',
      '/links',
      '/requests',
      '/settings',
    ]) {
      expect(paths).toContain(path)
    }
  })

  it('gates agent on member and settings on admin', () => {
    expect(routeByPath('/agent')?.minRole).toBe('member')
    expect(routeByPath('/settings')?.minRole).toBe('admin')
  })

  it('gates the request page on member, not on the role that reads the queue', () => {
    // The page has two halves and one minimum. `superadmin` here would hide the
    // *ask* behind the privilege the ask exists to obtain; the queue section
    // gates itself on the server's answer instead.
    expect(routeByPath('/requests')?.minRole).toBe('member')
    expect(routeByPath('/requests')?.nav).toBe(true)
  })
})

describe('the router gate is the registry minimum', () => {
  it('gates exactly the destinations the registry marks privileged', () => {
    for (const route of ROUTES) {
      const minimum = gateMinimum(route)
      if (route.minRole === 'anonymous') expect(minimum, route.id).toBeUndefined()
      else expect(minimum, route.id).toBe(route.minRole)
    }
  })

  it('reports the same minimum the sidebar and the palette filter on', () => {
    for (const route of ROUTES) {
      const command = ROUTE_COMMANDS.find((c) => c.id === `nav-${route.id}`)
      expect(gateMinimum(route) ?? 'anonymous', route.id).toBe(command?.minRole ?? 'anonymous')
    }
  })

  it('needs no gate for a deep link whose base path is anonymous', () => {
    const base = routePathForVariant('/word/:word')
    expect(base).toBe('/word')
    expect(base && gateMinimum(routeByPath(base))).toBeUndefined()
  })

  it('has no gate for an unknown path, so NotFound is not dressed as a prompt', () => {
    expect(gateMinimum(undefined)).toBeUndefined()
  })
})

describe('gate drift guard — the router holds no second copy of a role', () => {
  it('never writes a gate minimum as a literal', () => {
    // This is the defect: `<RequireRole minimum="admin">` next to a registry
    // that says something else, with nothing to notice the disagreement.
    expect(LITERAL_GATE.test(APP_CODE)).toBe(false)
  })

  it('names no role at all outside the registry', () => {
    expect(APP_CODE).not.toMatch(ROLE_LITERAL)
  })

  it('still derives the gate, so deleting the check cannot pass this test', () => {
    expect(APP_CODE).toContain('gateMinimum(routeByPath(path))')
  })
})

describe('deep links', () => {
  it('resolves every param variant back to a registry path', () => {
    for (const variant of PARAM_VARIANTS) {
      expect(routePathForVariant(variant.pattern)).toBe(variant.of)
      expect(routeByPath(variant.of), variant.pattern).toBeDefined()
    }
  })

  it('keeps the word deep link on the word panel', () => {
    expect(routePathForVariant('/word/:word')).toBe('/word')
    expect(routePathForVariant('/agent/:id')).toBeUndefined()
  })
})

describe('signInPath', () => {
  it('carries the origin path so the user lands back where they were', () => {
    expect(signInPath('/settings')).toBe('/login?from=%2Fsettings')
    expect(signInPath('/agent')).toBe('/login?from=%2Fagent')
  })

  it('stays bare with no origin, and never links to itself', () => {
    expect(signInPath()).toBe(LOGIN_PATH)
    expect(signInPath(LOGIN_PATH)).toBe(LOGIN_PATH)
  })

  it('round-trips the origin path through the query string', () => {
    const [, query = ''] = signInPath('/settings').split('?')
    expect(new URLSearchParams(query).get('from')).toBe('/settings')
  })
})

describe('collection deep links', () => {
  it('encodes the reported label so a label with spaces survives', () => {
    expect(collectionPath('Bible verses')).toBe('/data?collection=Bible%20verses')
  })

  it('reads the label back, and treats a missing parameter as empty', () => {
    expect(collectionFromSearch('?collection=Bible%20verses')).toBe('Bible verses')
    expect(collectionFromSearch('')).toBe('')
    expect(collectionFromSearch(new URLSearchParams())).toBe('')
  })
})

describe('pathOf', () => {
  it('resolves every registry id to its own recorded path', () => {
    for (const route of ROUTES) expect(pathOf(route.id), route.id).toBe(route.path)
  })

  it('agrees with the by-id and by-path lookups', () => {
    for (const route of ROUTES) {
      expect(routeById(route.id)?.path).toBe(pathOf(route.id))
      expect(routeByPath(pathOf(route.id))?.id).toBe(route.id)
    }
  })

  it('builds the dashboard deep link from the registry', () => {
    expect(pathOf('dashboard')).toBe(DASHBOARD_PATH)
  })
})

describe('wordPath', () => {
  it('produces a URL the `/word/:word` deep link actually routes', () => {
    expect(wordPath('pasian')).toBe('/word/pasian')
    expect(wordPath('pasian')).toMatch(/^\/word\/.+/u)
    expect(routePathForVariant('/word/:word')).toBe(pathOf('word'))
  })

  it('encodes a hostile headword so it cannot escape its segment', () => {
    expect(wordPath('a/b')).toBe('/word/a%2Fb')
    expect(wordPath('a?b')).toBe('/word/a%3Fb')
  })
})

describe('safeReturnPath — the `?from=` value is attacker-controllable', () => {
  it('keeps a same-origin path, query string included', () => {
    expect(safeReturnPath('/settings')).toBe('/settings')
    expect(safeReturnPath('/word/pasian?tab=forms')).toBe('/word/pasian?tab=forms')
  })

  it('falls back to the dashboard for an absent or blank value', () => {
    expect(safeReturnPath(null)).toBe(DASHBOARD_PATH)
    expect(safeReturnPath(undefined)).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('')).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('   ')).toBe(DASHBOARD_PATH)
  })

  it('refuses an absolute or protocol-relative URL — no open redirect', () => {
    expect(safeReturnPath('https://evil.example/steal')).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('http://evil.example')).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('//evil.example')).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('javascript:alert(1)')).toBe(DASHBOARD_PATH)
  })

  it('refuses a value carrying an interior control character, which would throw in pushState', () => {
    expect(safeReturnPath('/settings\n/x')).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('/settings\r\nSet-Cookie: a=b')).toBe(DASHBOARD_PATH)
    expect(safeReturnPath('/settings\tx')).toBe(DASHBOARD_PATH)
  })

  it('trims surrounding whitespace rather than rejecting it', () => {
    // A tab or newline *outside* the path is not an injection vector, so it is
    // trimmed; only an interior one is refused.
    expect(safeReturnPath('  /settings  ')).toBe('/settings')
    expect(safeReturnPath('\t/settings')).toBe('/settings')
  })
})

describe('path drift guard — destinations come from the registry, not from literals', () => {
  it('finds no hand-typed internal path outside the registry', () => {
    const offenders = LINK_SOURCES.flatMap((file) => {
      const source = readFileSync(join(SRC_ROOT, file), 'utf8')
      return pathLiterals(source).map((literal) => `${file}: ${literal.trim()}`)
    })
    expect(offenders).toEqual([])
  })

  it('holds for the router too, once its typed PAGES map is set aside', () => {
    // `PAGES` is keyed by the *derived* `RoutePath`, so its literals are checked
    // by the next test — a rename there is a compile error, which is stronger.
    expect(pathLiterals(APP_SOURCE.replace(PAGE_ENTRY, ''))).toEqual([])
  })

  it('keys the router PAGES map by exactly the registry paths', () => {
    const keys = [...APP_SOURCE.matchAll(PAGE_KEY)].map((match) => match[1])
    expect(keys).toEqual(ROUTES.map((route) => route.path))
  })

  it('actually scans the link sites, so an emptied scan cannot pass', () => {
    expect(LINK_SOURCES).toContain('routes/Login.tsx')
    expect(LINK_SOURCES).toContain('routes/Dashboard.tsx')
    expect(LINK_SOURCES).toContain('routes/Word.tsx')
    expect(LINK_SOURCES).toContain('routes/Data.tsx')
    expect(LINK_SOURCES).toContain('routes/NotFound.tsx')
    expect(LINK_SOURCES).toContain('routes/Search.tsx')
    expect(LINK_SOURCES.some((file) => file.startsWith('features/'))).toBe(true)
    expect(LINK_SOURCES.every((file) => !file.includes('.test.'))).toBe(true)
  })

  it('would still catch a reintroduced literal', () => {
    // A guard that cannot fail is not a guard: plant the defect in a snippet.
    expect(pathLiterals('<Link to="/settings">x</Link>')).toHaveLength(1)
    expect(pathLiterals('{ to: `/word/${w}` }')).toHaveLength(1)
    expect(pathLiterals("navigate('/agent')")).toHaveLength(1)
    expect(pathLiterals('<a href="/data">x</a>')).toHaveLength(1)
    expect(pathLiterals('<Link to={pathOf("settings")}>x</Link>')).toHaveLength(0)
    expect(pathLiterals("apiPost('/api/v1/word/x')")).toHaveLength(0)
  })
})
describe('sign-in is offered by every shell surface (the "no admin login" defect)', () => {
  it('the registry says the sign-in destination occupies all three surfaces', () => {
    expect(SIGN_IN_SURFACES).toEqual({ topBar: true, sidebar: true, palette: true })
    expect(specOf('login').path).toBe(LOGIN_PATH)
  })

  it('the top bar renders the registry sign-in control, not a local path', () => {
    const code = codeOf(SURFACE_SOURCES['components/TopBar.tsx'])
    // `signInEntry` carries the label/tone, `signInPath` the destination, and the
    // role comes from the server probe rather than a stored key.
    expect(code).toContain('signInEntry(')
    expect(code).toContain('signInPath(')
    expect(code).toContain('useAuthMe(')
    expect(pathLiterals(SURFACE_SOURCES['components/TopBar.tsx'])).toEqual([])
  })

  it('the sidebar footer renders the sign-in/sign-out entry for every role', () => {
    const code = codeOf(SURFACE_SOURCES['components/Sidebar.tsx'])
    expect(code).toContain('signInFooterEntry(')
    expect(code).toContain('signInSurfaces(')
    expect(code).toContain('useAuthMe(')
    expect(code).toContain('signOut()')
    // …and it is derived from the registry record + the server identity, never
    // from `can()` — the role filter that hides `/agent` and `/settings` must not
    // be able to hide the way to sign in.
    expect(code).toMatch(/const showSignIn = signInSurfaces\(specOf\('login'\)\)\.sidebar/)
    expect(code).not.toMatch(/showSignIn\s*=\s*[^\n]*can\(/)
    expect(pathLiterals(SURFACE_SOURCES['components/Sidebar.tsx'])).toEqual([])
  })

  it('the palette is built from the palette records, not from the nav list', () => {
    const code = codeOf(SURFACE_SOURCES['lib/commands.ts'])
    expect(code).toContain('PALETTE_ROUTES')
    expect(code).not.toContain('NAV_ROUTES')
  })

  it('every palette command has an icon, so no route falls back to the generic glyph', () => {
    const icons = new Set(
      [...SURFACE_SOURCES['components/CommandPalette.tsx'].matchAll(/'(nav-[a-z-]+)':/g)].map(
        (match) => match[1],
      ),
    )
    expect(icons).toContain('nav-login')
    for (const command of ROUTE_COMMANDS) {
      expect(icons, command.id).toContain(command.id)
    }
    // Mutation probe: a command id with no icon entry is what the guard catches.
    expect([...icons].includes('nav-nope')).toBe(false)
    expect([...ROUTE_COMMANDS.map((c) => c.id)].includes('nav-nope')).toBe(false)
  })
})

describe('Word panel URL state', () => {
  it('round-trips every sub-resource tab', () => {
    for (const resource of WORD_SUB_RESOURCES) {
      expect(wordPanelFromSearch(`?tab=${resource.key}`).tab, resource.key).toBe(resource.key)
      const built = wordSearch({ tab: resource.key })
      // The default tab is omitted from the URL by design, so decode answers
      // `undefined` for it and the page supplies `DEFAULT_WORD_TAB`.
      const decoded = wordPanelFromSearch(built).tab ?? DEFAULT_WORD_TAB
      expect(decoded, resource.key).toBe(resource.key)
    }
  })

  it('treats an absent or unknown tab as no tab, so the page keeps its default', () => {
    expect(wordPanelFromSearch('').tab).toBeUndefined()
    expect(wordPanelFromSearch('?tab=').tab).toBeUndefined()
    expect(wordPanelFromSearch('?tab=nope').tab).toBeUndefined()
    // Defaults are omitted from the URL but still decode to their own value.
    expect(wordPanelFromSearch('?tab=contexts').tab).toBe(DEFAULT_WORD_TAB)
  })

  it('decodes one limit parameter per sub-resource without reporting a change', () => {
    expect(wordPanelFromSearch('?tab=evidence&limit_contexts=50&limit_evidence=200')).toEqual({
      tab: 'evidence',
      limits: { contexts: 50, evidence: 200 },
      clamped: [],
    })
  })

  it('builds a query that survives URLSearchParams unchanged', () => {
    // The page writes through `setSearchParams`, which re-serializes through
    // `URLSearchParams` — a grammar using `:`/`,` came back as `%3A`/`%2C`.
    // These characters are the ones that escape, so the built string must be
    // byte-identical to what the serializer produces for a pasted link.
    const built = wordSearch({ tab: 'evidence', limits: { contexts: 50, evidence: 200 } })
    expect(new URLSearchParams(built).toString()).toBe(built)
    expect(built).not.toMatch(/%[0-9A-F]{2}/)
    expect(built).toBe('tab=evidence&limit_contexts=50&limit_evidence=200')
  })

  it('clamps over-large values to the documented cap and reports each change', () => {
    const state = wordPanelFromSearch('?limit_evidence=5000&limit_contexts=5000')
    expect(state.limits).toEqual({ evidence: 200, contexts: 100 })
    // Reported in `WORD_SUB_RESOURCES` order, not the URL's.
    expect(state.clamped).toEqual([
      { sub: 'contexts', requested: 5000, applied: 100, reason: 'cap' },
      { sub: 'evidence', requested: 5000, applied: 200, reason: 'cap' },
    ])
  })

  it('reports an in-bounds value the control does not offer instead of calling it a cap', () => {
    expect(wordPanelFromSearch('?limit_related=30')).toEqual({
      tab: undefined,
      limits: { related: 12 },
      clamped: [{ sub: 'related', requested: 30, applied: defaultWordLimit('related'), reason: 'choice' }],
    })
  })

  it('reports only the value a repeated key left in effect', () => {
    // Last occurrence wins, so an earlier over-large value that the URL itself
    // overrode is not a change the page made and must not be reported.
    expect(wordPanelFromSearch('?limit_evidence=5000&limit_evidence=50').limits).toEqual({ evidence: 50 })
    expect(wordPanelFromSearch('?limit_evidence=5000&limit_evidence=50').clamped).toEqual([])
    expect(wordPanelFromSearch('?limit_evidence=50&limit_evidence=5000').clamped).toEqual([
      { sub: 'evidence', requested: 5000, applied: 200, reason: 'cap' },
    ])
  })

  it('drops unknown sub-resources and malformed values without a clamp report', () => {
    const state = wordPanelFromSearch(
      '?limit_contexts=50&limit_bogus=99&limit_evidence=&limit_patterns=5abc&limit_forms=50:extra&limit_related=-5',
    )
    expect(state.limits).toEqual({ contexts: 50 })
    expect(state.clamped).toEqual([])
  })

  it('handles a mixed link: valid pairs, dropped pairs and two reported changes', () => {
    const state = wordPanelFromSearch(
      '?tab=forms&limit_contexts=20&limit_evidence=5000&limit_related=30&limit_bogus=1&limit_patterns=abc',
    )
    expect(state.tab).toBe('forms')
    expect(state.limits).toEqual({ contexts: 20, evidence: 200, related: 12 })
    expect(state.clamped).toEqual([
      { sub: 'evidence', requested: 5000, applied: 200, reason: 'cap' },
      { sub: 'related', requested: 30, applied: 12, reason: 'choice' },
    ])
    // Rebuilding drops the values the decoder already brought back to defaults.
    expect(wordSearch({ tab: state.tab, limits: state.limits })).toBe(
      'tab=forms&limit_evidence=200',
    )
  })

  it('builds the minimal string: defaults are omitted', () => {
    expect(wordSearch()).toBe('')
    expect(wordSearch({ tab: DEFAULT_WORD_TAB })).toBe('')
    expect(wordSearch({ tab: 'evidence' })).toBe('tab=evidence')
    expect(
      wordSearch({
        tab: DEFAULT_WORD_TAB,
        limits: { contexts: defaultWordLimit('contexts'), evidence: defaultWordLimit('evidence') },
      }),
    ).toBe('')
  })

  it('builds the shareable evidence link', () => {
    expect(wordSearch({ tab: 'evidence', limits: { evidence: 200 } })).toBe(
      'tab=evidence&limit_evidence=200',
    )
    expect(`${wordPath('pasian')}?${wordSearch({ tab: 'evidence', limits: { evidence: 200 } })}`).toBe(
      '/word/pasian?tab=evidence&limit_evidence=200',
    )
  })
})

describe('Word.tsx derives its panel state from the URL (source guard)', () => {
  it('no longer seeds the tab or limits from local state literals', () => {
    expect(WORD_CODE).not.toContain("useState<WordSubResource>('contexts')")
    expect(WORD_CODE).not.toContain('useState<Record<WordSubResource, number>>')
  })

  it('reads through the codec and writes back with replace, not push', () => {
    expect(WORD_CODE).toContain('useSearchParams(')
    expect(WORD_CODE).toContain('wordPanelFromSearch(')
    expect(WORD_CODE).toContain('wordSearch(')
    expect(WORD_CODE).toContain('replace: true')
  })
})

/**
 * The review queue's tab, table and text filter, encoded in the query string.
 *
 * Pure specs, because the node suite cannot mount `useSearchParams`: every
 * decoding and building rule has to be testable where it lives. The grammar is
 * the one the Word panel established after its first attempt failed — the page
 * writes through `setSearchParams`, which re-serializes through
 * `URLSearchParams` and escapes everything outside `A-Za-z0-9*._-`, so one
 * packed `tab=…:…` parameter reached the address bar as `%3A`. One parameter per
 * fact, values from closed sets, defaults omitted — and `q` is the single
 * exception, because it is free text an operator typed.
 */
describe('Review queue URL state', () => {
  it('keeps every tab and table name inside the characters that survive the serializer', () => {
    // The structural rule, tested against the registries rather than a copy of
    // the names: one uppercase letter or one `-` in a whitelist entry and the
    // link silently arrives percent-encoded.
    for (const tab of REVIEW_TABS) expect(tab, tab).toMatch(/^[a-z_]+$/)
    for (const table of RECORDS_WHITELIST) expect(table, table).toMatch(/^[a-z_]+$/)
    expect(DEFAULT_REVIEW_TAB).toMatch(/^[a-z_]+$/)
    expect(DEFAULT_REVIEW_TABLE).toMatch(/^[a-z_]+$/)
  })

  it('round-trips every review tab', () => {
    for (const tab of REVIEW_TABS) {
      expect(reviewPanelFromSearch(`?tab=${tab}`).tab, tab).toBe(tab)
      // The default tab is omitted from the URL by design, so decode answers
      // `undefined` for it and the page supplies `DEFAULT_REVIEW_TAB`.
      const decoded = reviewPanelFromSearch(reviewSearch({ tab })).tab ?? DEFAULT_REVIEW_TAB
      expect(decoded, tab).toBe(tab)
    }
  })

  it('round-trips every whitelisted table', () => {
    for (const table of RECORDS_WHITELIST) {
      expect(reviewPanelFromSearch(`?table=${table}`).table, table).toBe(table)
      const decoded = reviewPanelFromSearch(reviewSearch({ table })).table ?? DEFAULT_REVIEW_TABLE
      expect(decoded, table).toBe(table)
    }
  })

  it('round-trips a full tab, table and filter combination', () => {
    for (const tab of REVIEW_TABS) {
      for (const table of RECORDS_WHITELIST) {
        const built = reviewSearch({ tab, table, q: 'hiam' })
        const decoded = reviewPanelFromSearch(built)
        // Defaults are omitted from the link, so the page's fallback is part of
        // the round trip.
        expect(decoded.tab ?? DEFAULT_REVIEW_TAB, built).toBe(tab)
        expect(decoded.table ?? DEFAULT_REVIEW_TABLE, built).toBe(table)
        expect(decoded.q, built).toBe('hiam')
      }
    }
  })

  it('treats an absent or unknown tab and table as no override, so the page keeps its defaults', () => {
    expect(reviewPanelFromSearch('')).toEqual({ tab: undefined, table: undefined, q: '' })
    expect(reviewPanelFromSearch('?tab=&table=').tab).toBeUndefined()
    expect(reviewPanelFromSearch('?tab=&table=').table).toBeUndefined()
    // A table the server's whitelist does not contain is dropped, not forwarded:
    // `records.list` 400s on anything outside it.
    expect(reviewPanelFromSearch('?tab=nope&table=secret_table').tab).toBeUndefined()
    expect(reviewPanelFromSearch('?tab=nope&table=secret_table').table).toBeUndefined()
    // The closed sets are lower-case, so a pasted uppercase value is unknown.
    expect(reviewPanelFromSearch('?tab=Audit').tab).toBeUndefined()
    expect(reviewPanelFromSearch('?table=Dictionary').table).toBeUndefined()
    // The defaults are omitted from the URL but still decode to their own value.
    expect(reviewPanelFromSearch('?tab=browse').tab).toBe(DEFAULT_REVIEW_TAB)
    expect(reviewPanelFromSearch('?table=dictionary').table).toBe(DEFAULT_REVIEW_TABLE)
  })

  it('builds the minimal string: defaults and a blank filter are omitted', () => {
    expect(reviewSearch()).toBe('')
    expect(reviewSearch({ tab: DEFAULT_REVIEW_TAB, table: DEFAULT_REVIEW_TABLE, q: '' })).toBe('')
    expect(reviewSearch({ tab: DEFAULT_REVIEW_TAB, table: DEFAULT_REVIEW_TABLE })).toBe('')
    // An all-whitespace box is "no filter", not a filter that matches nothing —
    // the same rule the transport applies, because the server 400s on `min_length=1`.
    expect(reviewSearch({ q: '   ' })).toBe('')
    expect(reviewSearch({ tab: 'audit' })).toBe('tab=audit')
    expect(reviewSearch({ table: 'phrases' })).toBe('table=phrases')
  })

  it('stores the filter trimmed, the way it goes to the wire', () => {
    expect(reviewSearch({ q: '  hiam  ' })).toBe('q=hiam')
    expect(reviewPanelFromSearch('q=hiam').q).toBe('hiam')
  })

  it('keeps the closed-set parameters byte-identical through URLSearchParams', () => {
    // Whatever the page writes, the address bar shows the serializer's output.
    // For `tab` and `table` that must be the exact string the codec built.
    for (const tab of REVIEW_TABS) {
      for (const table of RECORDS_WHITELIST) {
        const built = reviewSearch({ tab, table })
        expect(new URLSearchParams(built).toString(), built).toBe(built)
        expect(built).not.toMatch(/%[0-9A-F]{2}/)
      }
    }
  })

  it('escapes a hostile filter exactly once and reads it back unchanged', () => {
    const hostile = [
      'a&b',
      'a#b',
      'a:b',
      'a,b',
      '100%',
      'a+b',
      '?q=x',
      'table=phrases',
      'café',
      'ẓohŋ·tlaŋ',
      'x'.repeat(500),
    ]
    for (const q of hostile) {
      const built = reviewSearch({ tab: 'audit', q })
      // The value never breaks out of its own parameter: exactly one separator
      // survives (the one between `tab` and `q`), and a raw `#` would turn the
      // rest of the pasted link into a fragment.
      expect(built.split('&'), q).toHaveLength(2)
      expect(built.split('#'), q).toHaveLength(1)
      // One round trip through the serializer, and the text is exactly what was
      // typed — the tab parameter still sits beside it, unescaped.
      expect(new URLSearchParams(built).get('q'), q).toBe(q)
      expect(reviewPanelFromSearch(built).q, q).toBe(q)
      expect(reviewPanelFromSearch(built).tab, q).toBe('audit')
      expect(built.startsWith('tab=audit&q='), q).toBe(true)
    }
  })

  it('lets the last occurrence win for a repeated tab, table or filter', () => {
    expect(reviewPanelFromSearch('?tab=browse&tab=audit').tab).toBe('audit')
    expect(reviewPanelFromSearch('?table=phrases&table=dictionary').table).toBe('dictionary')
    expect(reviewPanelFromSearch('?q=one&q=two').q).toBe('two')
    // A repeated key whose *last* value is unknown is still unknown — the page
    // keeps its default rather than honouring an earlier pair the URL overrode.
    expect(reviewPanelFromSearch('?table=phrases&table=nope').table).toBeUndefined()
    expect(reviewPanelFromSearch('?tab=audit&tab=').tab).toBeUndefined()
  })

  it('builds the shareable audit link', () => {
    expect(reviewSearch({ tab: 'audit', table: 'phrases', q: 'hiam' })).toBe(
      'tab=audit&table=phrases&q=hiam',
    )
    expect(`${pathOf('review')}?${reviewSearch({ tab: 'audit', table: 'phrases', q: 'hiam' })}`).toBe(
      '/review?tab=audit&table=phrases&q=hiam',
    )
    // The default view carries nothing: the link is just the route, so a page
    // only ever appends `?` when the codec actually built something.
    expect(reviewSearch({ tab: DEFAULT_REVIEW_TAB, table: DEFAULT_REVIEW_TABLE, q: '' })).toBe('')
  })
})

describe('Agent run URL state', () => {
  it('reads a run id from the query', () => {
    expect(agentRunFromSearch('?run=412')).toBe(412)
    expect(agentRunFromSearch('run=412')).toBe(412)
    expect(agentRunFromSearch(new URLSearchParams('run=412'))).toBe(412)
    expect(agentRunFromSearch('?tab=audit&run=7')).toBe(7)
  })

  it('accepts only digits, so the serializer can never escape what it writes', () => {
    // The value space is `[0-9]+` — exactly the set URLSearchParams leaves alone.
    // Anything else in the address is not an id, and the page falls back to its
    // own empty state rather than fetching a run the server cannot have.
    const notAnId = ['abc', '412.5', '1e3', '-3', '+412', '0x1a4', 'run', '٤١٢', '4 1 2', '']
    for (const raw of notAnId) {
      expect(agentRunFromSearch(`run=${encodeURIComponent(raw)}`), raw).toBeNull()
    }
  })

  it('treats a non-positive id as no id at all', () => {
    // `useAgentRun` treats `<= 0` as "no query"; the codec agrees, so `?run=0`
    // cannot make the page fire a request for a run that does not exist.
    expect(agentRunFromSearch('?run=0')).toBeNull()
    expect(agentRunFromSearch('?run=000')).toBeNull()
    expect(agentRunFromSearch('?run=0412')).toBe(412)
    expect(agentSearch(0)).toBe('')
    expect(agentSearch(-3)).toBe('')
    expect(agentSearch(null)).toBe('')
    expect(agentSearch(undefined)).toBe('')
  })

  it('trims surrounding whitespace, including the percent-escaped form', () => {
    expect(agentRunFromSearch('?run=%20412%20')).toBe(412)
    expect(agentRunFromSearch('?run=%09412%0A')).toBe(412)
  })

  it('lets the last occurrence win, as every other parameter here does', () => {
    expect(agentRunFromSearch('?run=1&run=412')).toBe(412)
    // A last value that is not an id does not fall back to the earlier one.
    expect(agentRunFromSearch('?run=412&run=nope')).toBeNull()
  })

  it('builds the minimal link and never an empty query', () => {
    expect(agentSearch(412)).toBe('run=412')
    expect(`${pathOf('agent')}?${agentSearch(412)}`).toBe('/agent?run=412')
  })

  it('round-trips a run id with no percent-encoding anywhere', () => {
    for (const id of [1, 7, 42, 412, 9999, 123456789]) {
      const search = agentSearch(id)
      expect(search, String(id)).toBe(`run=${id}`)
      expect(search, String(id)).not.toContain('%')
      expect(new URLSearchParams(search).get(AGENT_RUN_PARAM), String(id)).toBe(String(id))
      expect(agentRunFromSearch(`?${search}`), String(id)).toBe(id)
    }
  })

  it('knows exactly one parameter: the run id, never the goal', () => {
    // The goal is an input, not a view. Encoding it would put a paragraph of
    // prose in the address bar and let a pasted link re-run someone else's goal
    // by accident, so the codec's whole surface is one digits-only key.
    expect(AGENT_RUN_PARAM).toBe('run')
    const CODE = readFileSync(fileURLToPath(new URL('./routes.ts', import.meta.url)), 'utf8')
    const codec = CODE.slice(CODE.indexOf('export const AGENT_RUN_PARAM'))
    expect(codec).toContain('params.set(AGENT_RUN_PARAM, String(runId))')
    expect(codec).not.toMatch(/params\.set\(\s*['"]goal['"]/)
    expect(agentSearch(412)).not.toContain('goal')
  })
})
