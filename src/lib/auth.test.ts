import { describe, expect, it } from 'vitest'
import { ROLES, can, rankOf, roleBadge } from './auth'
import { COMMAND_ACTIONS, ROUTE_COMMANDS, filterCommands } from './commands'
import { AuthMeSchema, parseOrThrow } from './schemas'
import type { Role } from './schemas'

describe('role ranking', () => {
  it('orders anonymous < member < admin', () => {
    expect(rankOf('anonymous')).toBe(0)
    expect(rankOf('member')).toBe(1)
    expect(rankOf('admin')).toBe(2)
  })

  it('exposes exactly the three server-side roles', () => {
    expect([...ROLES]).toEqual(['anonymous', 'member', 'admin'])
  })
})

describe('can', () => {
  it('meets a minimum at or above it', () => {
    expect(can('admin', 'member')).toBe(true)
    expect(can('member', 'member')).toBe(true)
    expect(can('admin', 'admin')).toBe(true)
  })

  it('withholds access below the minimum', () => {
    expect(can('anonymous', 'member')).toBe(false)
    expect(can('member', 'admin')).toBe(false)
    expect(can('anonymous', 'admin')).toBe(false)
  })

  it('treats anonymous as sufficient for public routes', () => {
    for (const role of ROLES) expect(can(role, 'anonymous')).toBe(true)
  })
})

describe('roleBadge', () => {
  it('gives each role a distinct label and badge variant', () => {
    const labels = ROLES.map((role) => roleBadge(role).label)
    expect(new Set(labels).size).toBe(ROLES.length)
    expect(roleBadge('admin').variant).toBe('default')
    expect(roleBadge('member').variant).toBe('secondary')
    expect(roleBadge('anonymous').variant).toBe('outline')
  })

  it('never hints at capabilities the role does not have', () => {
    // Anonymous must not be told it can run agents or edit providers.
    expect(roleBadge('anonymous').hint).not.toMatch(/agent runs|provider settings/i)
    expect(roleBadge('member').hint).not.toMatch(/provider settings/i)
    expect(roleBadge('admin').hint).toMatch(/provider settings/i)
  })
})

describe('AuthMeSchema tolerance', () => {
  it('parses a real identity payload', () => {
    const parsed = AuthMeSchema.parse({
      role: 'admin',
      key_prefix: 'zl_ab12',
      scopes: ['settings:read', 'settings:write'],
      mode: 'enforce',
    })
    expect(parsed.role).toBe('admin')
    expect(parsed.key_prefix).toBe('zl_ab12')
    expect(parsed.scopes).toEqual(['settings:read', 'settings:write'])
  })

  it('collapses an unknown role to anonymous — the least-privileged reading', () => {
    const parsed = parseOrThrow(
      AuthMeSchema,
      { role: 'superuser', key_prefix: 'zl_x', scopes: [], mode: 'warn' },
      'auth/me',
    )
    expect(parsed.role).toBe('anonymous')
  })

  it('degrades a malformed body instead of failing the gate', () => {
    const parsed = parseOrThrow(AuthMeSchema, { role: 42 }, 'auth/me')
    expect(parsed.role).toBe('anonymous')
    // Absent → undefined, invalid → null; either way no leaked prefix.
    expect(parsed.key_prefix ?? null).toBeNull()
    expect(parsed.scopes).toEqual([])
  })
})

describe('command palette role filter', () => {
  it('hides agent + settings from anonymous, keeps public reads', () => {
    const ids = filterCommands(COMMAND_ACTIONS, 'anonymous').map((c) => c.id)
    expect(ids).not.toContain('nav-agent')
    expect(ids).not.toContain('nav-settings')
    expect(ids).toContain('nav-assistant')
    expect(ids).toContain('nav-word')
  })

  it('lets a member reach the agent but not settings', () => {
    const ids = filterCommands(COMMAND_ACTIONS, 'member').map((c) => c.id)
    expect(ids).toContain('nav-agent')
    expect(ids).not.toContain('nav-settings')
  })

  it('gives an admin every route', () => {
    expect(filterCommands(COMMAND_ACTIONS, 'admin').length).toBe(COMMAND_ACTIONS.length)
  })

  it('keeps non-route commands (theme, key, word) role-independent', () => {
    const gated: Role[] = []
    for (const action of COMMAND_ACTIONS) {
      if (action.kind === 'navigate') continue
      if (action.minRole) gated.push(action.minRole)
    }
    expect(gated).toEqual([])
  })

  it('covers every routed page, each with an id mirroring its NAV_ITEM', () => {
    const paths = ROUTE_COMMANDS.map((c) => c.to)
    for (const path of ['/', '/word', '/analyze', '/search', '/rag', '/assistant', '/agent', '/data', '/links', '/settings']) {
      expect(paths).toContain(path)
    }
    expect(paths.length).toBe(new Set(paths).size)
  })
})
