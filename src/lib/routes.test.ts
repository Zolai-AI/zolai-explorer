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
  routeById,
  routeByPath,
  routePathForVariant,
  signInPath,
  type RouteIconName,
} from './routes'

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