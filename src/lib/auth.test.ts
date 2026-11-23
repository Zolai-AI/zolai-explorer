import { describe, expect, it } from 'vitest'
import { ROLES, authModeNotice, can, rankOf, roleBadge } from './auth'
import { COMMAND_ACTIONS, ROUTE_COMMANDS, filterCommands } from './commands'
import { AuthMeSchema, parseOrThrow } from './schemas'
import type { Role } from './schemas'

describe('role ranking', () => {
  it('orders anonymous < member < admin < superadmin', () => {
    expect(rankOf('anonymous')).toBe(0)
    expect(rankOf('member')).toBe(1)
    expect(rankOf('admin')).toBe(2)
    expect(rankOf('superadmin')).toBe(3)
  })

  it('exposes exactly the four server-side roles', () => {
    expect([...ROLES]).toEqual(['anonymous', 'member', 'admin', 'superadmin'])
  })

  it('ranks a role the server has never heard of as anonymous', () => {
    // A future server role must not inherit privileges from an index lookup.
    expect(rankOf('overlord' as Role)).toBe(0)
  })
})

describe('can', () => {
  it('meets a minimum at or above it', () => {
    expect(can('admin', 'member')).toBe(true)
    expect(can('member', 'member')).toBe(true)
    expect(can('admin', 'admin')).toBe(true)
    // Superadmin clears every gate, including one set at admin.
    expect(can('superadmin', 'admin')).toBe(true)
    expect(can('superadmin', 'superadmin')).toBe(true)
  })

  it('withholds access below the minimum', () => {
    expect(can('anonymous', 'member')).toBe(false)
    expect(can('member', 'admin')).toBe(false)
    expect(can('anonymous', 'admin')).toBe(false)
    // The role gate `role:manage` sits behind is not cleared by being an admin.
    expect(can('admin', 'superadmin')).toBe(false)
  })

  it('treats anonymous as sufficient for public routes', () => {
    for (const role of ROLES) expect(can(role, 'anonymous')).toBe(true)
  })
})

describe('roleBadge', () => {
  it('gives each role a distinct label and badge variant', () => {
    const labels = ROLES.map((role) => roleBadge(role).label)
    expect(new Set(labels).size).toBe(ROLES.length)
    expect(roleBadge('superadmin').variant).toBe('default')
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

  it('keeps role management in the superadmin sentence alone', () => {
    // `role:manage` is the difference between the two top tiers, so an admin hint
    // that mentioned role changes would advertise a route the writer refuses.
    expect(roleBadge('admin').hint).not.toMatch(/role/i)
    expect(roleBadge('superadmin').hint).toMatch(/role changes/i)
    expect(roleBadge('superadmin').hint).toMatch(/request queue/i)
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

  it('accepts superadmin as the role the server answers', () => {
    const parsed = AuthMeSchema.parse({
      role: 'superadmin',
      scopes: [],
      mode: 'enforce',
      auth_source: 'session',
      username: 'founder',
    })
    expect(parsed.role).toBe('superadmin')
    expect(parsed.username).toBe('founder')
  })

  it('keeps the server’s own `auth_source` spellings', () => {
    // `api_key` with an underscore is what `rbac.auth_me` answers. This client
    // spelled it `api-key` and invented `none`, so every key-backed identity fell
    // into the catch and no reader could ever tell a key from a session.
    for (const source of ['anonymous', 'api_key', 'session', 'oauth'] as const) {
      const parsed = AuthMeSchema.parse({ role: 'member', scopes: [], mode: 'warn', auth_source: source })
      expect(parsed.auth_source, source).toBe(source)
    }
  })

  it('reads an unknown or absent auth source as anonymous, never as a key', () => {
    // A source this build cannot read must not read as "a key worked".
    const hyphenated = parseOrThrow(
      AuthMeSchema,
      { role: 'member', scopes: [], mode: '', auth_source: 'api-key' },
      'auth/me',
    )
    expect(hyphenated.auth_source).toBe('anonymous')
    expect(hyphenated.key_prefix ?? null).toBeNull()

    const absent = parseOrThrow(AuthMeSchema, { role: 'member', scopes: [], mode: '' }, 'auth/me')
    expect(absent.auth_source).toBe('anonymous')
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

describe('authModeNotice — the warn-mode banner copy', () => {
  it('says so, with a Sign in CTA, while the API is in warn mode and nobody is signed in', () => {
    const notice = authModeNotice('warn', 'anonymous')
    expect(notice.show).toBe(true)
    expect(notice.title).toMatch(/warn mode/)
    expect(notice.body).toMatch(/flip to enforce/)
    expect(notice.body).toMatch(/anonymous/)
    // Warn mode may flip; it never claims a key is needed *today*.
    expect(notice.body).not.toMatch(/requires a key|key is required/i)
    expect(notice.cta).toBeTruthy()
  })

  it('never nags a signed-in user — a session or key already survives an enforce flip', () => {
    for (const role of ['member', 'admin'] as const) {
      const notice = authModeNotice('warn', role)
      expect(notice.show, role).toBe(false)
      expect(notice.cta, role).toBeNull()
      expect(notice.body, role).toBe('')
      expect(notice.tone, role).toBe('ok')
    }
  })

  it('stays quiet in enforce mode (the 401s say it) and when auth is off', () => {
    expect(authModeNotice('enforce', 'anonymous').show).toBe(false)
    expect(authModeNotice('off', 'anonymous').show).toBe(false)
  })

  it('stays quiet when the mode is unknown instead of guessing', () => {
    expect(authModeNotice('', 'anonymous').show).toBe(false)
    expect(authModeNotice('something-new', 'admin').show).toBe(false)
  })

  it('tolerates casing and padding from the server', () => {
    expect(authModeNotice(' WARN ', 'anonymous').show).toBe(true)
  })
})
