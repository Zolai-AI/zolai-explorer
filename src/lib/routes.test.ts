import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROLES } from './auth'
import { ROUTE_COMMANDS } from './commands'
import {
  LOGIN_PATH,
  NAV_ROUTES,
  PARAM_VARIANTS,
  ROUTES,
  collectionFromSearch,
  collectionPath,
  gateMinimum,
  routeById,
  routeByPath,
  routePathForVariant,
  signInPath,
  type RouteIconName,
} from './routes'

/** The router source — read so a second copy of a role cannot hide in it. */
const APP_SOURCE = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8')

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
]

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

  it('is reachable through the lookup helpers', () => {
    expect(routeById('settings')?.path).toBe('/settings')
    expect(routeByPath('/word')?.id).toBe('word')
    expect(routeByPath('/nope')).toBeUndefined()
  })
})

describe('router / sidebar / palette read the same records', () => {
  it('the palette exposes exactly one command per navigable route', () => {
    expect(ROUTE_COMMANDS.length).toBe(NAV_ROUTES.length)
    for (const route of NAV_ROUTES) {
      const command = ROUTE_COMMANDS.find((c) => c.id === `nav-${route.id}`)
      expect(command, route.id).toBeDefined()
      expect(command?.to).toBe(route.path)
      expect(command?.minRole).toBe(route.minRole)
    }
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