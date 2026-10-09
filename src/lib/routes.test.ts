import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROLES } from './auth'
import { ROUTE_COMMANDS } from './commands'
import {
  DASHBOARD_PATH,
  LOGIN_PATH,
  NAV_ROUTES,
  PALETTE_ROUTES,
  PARAM_VARIANTS,
  ROUTES,
  ROUTE_REGISTRY,
  collectionFromSearch,
  collectionPath,
  gateMinimum,
  inPalette,
  pathOf,
  routeById,
  routeByPath,
  routePathForVariant,
  safeReturnPath,
  signInPath,
  specOf,
  wordPath,
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
  'database',
  'link',
  'settings',
  'key',
  'file-text',
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
      '/settings',
    ]) {
      expect(paths).toContain(path)
    }
  })

  it('gates agent on member and settings on admin', () => {
    expect(routeByPath('/agent')?.minRole).toBe('member')
    expect(routeByPath('/settings')?.minRole).toBe('admin')
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
