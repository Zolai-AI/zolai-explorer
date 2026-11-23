import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROLES, can, roleBadge, type Role } from './auth'
import { COMMAND_ACTIONS, ROUTE_COMMANDS, filterCommands, routeCommandsFor } from './commands'
import {
  NAV_ROUTES,
  PALETTE_ROUTES,
  ROUTES,
  ROUTE_REGISTRY,
  inPalette,
  pathOf,
  specOf,
  type RouteSpec,
} from './routes'
import {
  SIGN_IN_SURFACES,
  identitySummary,
  signInEntry,
  signInFooterEntry,
  signInSurfaces,
} from './signIn'

/** Every role the server can report — the discoverability bar is all of them. */
const IDENTIFIED: Role[] = ROLES.filter((role) => role !== 'anonymous')

/** A copy of the sign-in record with `palette` forced on or off. */
function withPaletteFlag(flag: boolean | undefined): RouteSpec {
  return { ...specOf('login'), palette: flag }
}

describe('the sign-in destination — one registry record', () => {
  it('is non-nav and anonymous, so nobody can gate the way out of a gate', () => {
    const spec = specOf('login')
    expect(spec.path).toBe('/login')
    expect(spec.nav).toBe(false)
    expect(spec.minRole).toBe('anonymous')
    expect(can('anonymous', spec.minRole)).toBe(true)
  })

  it('is the only non-nav record, so ⌘K gains exactly one command and no more', () => {
    expect(ROUTES.filter((route) => !route.nav).map((route) => route.id)).toEqual(['login'])
    expect(PALETTE_ROUTES.length).toBe(NAV_ROUTES.length + 1)
    expect(PALETTE_ROUTES.filter((route) => !route.nav).map((route) => route.id)).toEqual(['login'])
  })
});

describe('sign-in is discoverable from the top bar, the sidebar and ⌘K — every role', () => {
  it('every surface claims the destination, role-independently', () => {
    // The same answer for anonymous, member and admin: a user who cannot sign
    // out is as stranded as a user who cannot sign in.
    for (const role of ROLES) {
      expect(signInSurfaces(specOf('login')), role).toEqual({
        topBar: true,
        sidebar: true,
        palette: true,
      })
    }
    expect(SIGN_IN_SURFACES).toEqual({ topBar: true, sidebar: true, palette: true })
  })

  it('the palette offers it for anonymous and for admin alike', () => {
    for (const role of ROLES) {
      expect(filterCommands(COMMAND_ACTIONS, role).map((c) => c.id), role).toContain('nav-login')
    }
  })

  it('the palette command carries the registry path and no role gate', () => {
    const command = ROUTE_COMMANDS.find((c) => c.id === 'nav-login')
    expect(command?.to).toBe(pathOf('login'))
    expect(command?.minRole).toBe('anonymous')
    expect(command?.label).toBe(specOf('login').label)
  })

  it('the top-bar control exists for every role and always points at the record', () => {
    for (const role of ROLES) {
      const entry = signInEntry({ role, keyPrefix: role === 'anonymous' ? null : 'zl_ab12' })
      expect(entry.to, role).toBe(pathOf('login'))
      expect(entry.role, role).toBe(role)
      expect(entry.label.length, role).toBeGreaterThan(1)
      expect(entry.title.length, role).toBeGreaterThan(5)
    }
  })

  it('the sidebar footer offers sign-in to anonymous and sign-out to the rest', () => {
    const anonymous = signInFooterEntry({ role: 'anonymous' })
    expect(anonymous.action).toBe('sign-in')
    expect(anonymous.to).toBe(pathOf('login'))
    expect(anonymous.roleLabel).toBeNull()

    for (const role of IDENTIFIED) {
      const entry = signInFooterEntry({ role, keyPrefix: 'zl_ab12' })
      expect(entry.action, role).toBe('sign-out')
      // A sign-out is an action, not a destination — no `to`, so nothing can 404.
      expect(entry.to, role).toBeNull()
      expect(entry.roleLabel, role).toBe(roleBadge(role).label)
      expect(entry.keyPrefix, role).toBe('zl_ab12')
    }
  })

  it('promises only what pressing Sign out really ends', () => {
    // Two credentials, two consequences: ending a session leaves the stored key
    // alone, clearing a key ends the key. One sentence for both told a session
    // user their key was going away, which it is not.
    const session = signInFooterEntry({ role: 'admin', authSource: 'session' })
    expect(session.title).toMatch(/ends this session/i)
    expect(session.title).not.toMatch(/clears the stored key/)

    const keyed = signInFooterEntry({ role: 'member', keyPrefix: 'zl_ab12', authSource: 'api_key' })
    expect(keyed.title).toMatch(/clears the stored key/i)

    // An MCP token is not something this browser holds, so the control must not
    // promise to clear it.
    const oauth = signInFooterEntry({ role: 'member', authSource: 'oauth' })
    expect(oauth.title).toMatch(/MCP access token/)
    expect(oauth.title).not.toMatch(/clears the stored key/i)

    // With no source reported, the control must not claim either specific act.
    const unknown = signInFooterEntry({ role: 'member' })
    expect(unknown.title).not.toMatch(/ends this session/i)
    expect(unknown.title).not.toMatch(/clears the stored key/i)
  })

  it('offers the session card’s Sign out only while a session is active', () => {
    // Node has no DOM here, so this is a source guard — the same reason the
    // shell surfaces are asserted as text: a control that renders for an
    // anonymous visitor is invisible to every other check in this file.
    const login = readFileSync(fileURLToPath(new URL('../routes/Login.tsx', import.meta.url)), 'utf8')
    expect(login.match(/onClick=\{leaveSession\}/g) ?? []).toHaveLength(1)
    const gate = login.indexOf("me.auth_source === 'session'")
    const button = login.indexOf('onClick={leaveSession}')
    expect(gate).toBeGreaterThan(-1)
    expect(button).toBeGreaterThan(gate)
    // Nothing closed the conditional between the gate and the control — the gate
    // wraps this button rather than merely sitting earlier in the file.
    expect(login.slice(gate, button)).not.toContain(')}')
  })

  it('offers the key card’s Sign out only while a key is the credential in play', () => {
    // `leaveKey` calls `signOut()`, and `signOut()` ends a *session* first when
    // one exists. Gated on the local `hasKey` alone, a tab signed in with an
    // account was handed a key-card button that signed it out of something else.
    const login = readFileSync(fileURLToPath(new URL('../routes/Login.tsx', import.meta.url)), 'utf8')
    expect(login.match(/onClick=\{leaveKey\}/g) ?? []).toHaveLength(1)
    const gate = login.indexOf('{canLeaveKey && (')
    const button = login.indexOf('onClick={leaveKey}')
    expect(gate).toBeGreaterThan(-1)
    expect(button).toBeGreaterThan(gate)
    expect(login.slice(gate, button)).not.toContain(')}')
    // The derivation itself: the server's word decides, a stored key may still
    // warn, and a session is never signed out from this card.
    expect(login).toMatch(
      /const canLeaveKey =\s*me\.auth_source === 'api_key' \|\| \(hasKey && me\.auth_source !== 'session'\)/,
    )
  })

  it('feeds the identity panel the auth source the server reported', () => {
    // `hasKey` alone hid the panel from an account-signed tab — the page had no
    // way to say anything about the credential it had just accepted.
    const login = readFileSync(fileURLToPath(new URL('../routes/Login.tsx', import.meta.url)), 'utf8')
    expect(login).toMatch(
      /identitySummary\(\s*\{[^}]*authSource: me\.auth_source[^}]*username: me\.username[^}]*\}/s,
    )
  })
});

describe('the top-bar control — honest, and role-aware from the server only', () => {
  it('reads "Sign in" in the amber no-key language while anonymous', () => {
    const entry = signInEntry({ role: 'anonymous' })
    expect(entry.anonymous).toBe(true)
    expect(entry.label).toBe('Sign in')
    expect(entry.label).toBe(specOf('login').label)
    expect(entry.keyPrefix).toBeNull()
    expect(entry.roleLabel).toBe('Anonymous')
    expect(entry.title).toMatch(/public endpoints only/i)
  })

  it('shows the role the server reported and the prefix it echoed', () => {
    for (const role of IDENTIFIED) {
      const entry = signInEntry({ role, keyPrefix: 'zl_ab12' })
      expect(entry.anonymous, role).toBe(false)
      expect(entry.roleLabel, role).toBe(roleBadge(role).label)
      expect(entry.keyPrefix, role).toBe('zl_ab12')
      expect(entry.label, role).toBe('Signed in')
      expect(entry.title, role).toContain(roleBadge(role).label.toLowerCase())
    }
  })

  it('never claims an identity that a stored-but-unrecognised key does not have', () => {
    // A key in localStorage is not identity; only `/auth/me` is.
    const storedButUnknown = signInEntry({ role: 'anonymous', keyPrefix: 'zl_ab12' })
    expect(storedButUnknown.anonymous).toBe(true)
    expect(storedButUnknown.role).toBe('anonymous')
  })

  it('treats a blank or absent prefix as no prefix', () => {
    for (const keyPrefix of [undefined, null, '', '   ']) {
      expect(signInEntry({ role: 'admin', keyPrefix }).keyPrefix).toBeNull()
    }
  })
})

describe('the `palette` registry flag drives ⌘K — no id is written into commands.ts', () => {
  it('membership changes when the flag changes', () => {
    expect(inPalette(specOf('login'))).toBe(true)
    expect(inPalette(withPaletteFlag(false))).toBe(false)
    expect(inPalette(withPaletteFlag(true))).toBe(true)
    expect(signInSurfaces(withPaletteFlag(false)).palette).toBe(false)
    expect(signInSurfaces(withPaletteFlag(true)).palette).toBe(true)
  })

  it('the nav-only record set has no sign-in command; the flagged set has it', () => {
    const navOnly = routeCommandsFor(NAV_ROUTES).map((command) => command.id)
    const flagged = routeCommandsFor(PALETTE_ROUTES).map((command) => command.id)
    expect(navOnly).not.toContain('nav-login')
    expect(flagged).toContain('nav-login')
    expect(flagged).toEqual(ROUTE_COMMANDS.map((command) => command.id))
  })

  it('a mutation probe on the flag really removes the command', () => {
    // Same records, one flag off: the command disappears from the derived set
    // while the shipped palette still holds it — so the flag is the cause.
    const withoutFlag = routeCommandsFor(PALETTE_ROUTES.filter((route) => !inPalette(route)))
    expect(withoutFlag.map((command) => command.id)).not.toContain('nav-login')
    expect(ROUTE_COMMANDS.map((command) => command.id)).toContain('nav-login')
  })

  it('nav records are in the palette by definition — the flag only names exceptions', () => {
    for (const route of NAV_ROUTES) expect(inPalette(route), route.id).toBe(true)
    expect(ROUTE_REGISTRY.filter((route) => route.nav && route.palette !== undefined)).toEqual([])
  })
})

describe('signInSurfaces refuses an affordance it cannot honestly claim', () => {
  it('claims nothing when there is no record', () => {
    expect(signInSurfaces(undefined)).toEqual({ topBar: false, sidebar: false, palette: false })
  })

  it('claims nothing when sign-in would itself need a privilege', () => {
    const gated: RouteSpec = { ...specOf('login'), minRole: 'admin' }
    expect(signInSurfaces(gated)).toEqual({ topBar: false, sidebar: false, palette: false })
  })
})

describe('identitySummary — what the /login page reports about the credential in play', () => {
  it('says nothing when no key is stored', () => {
    const summary = identitySummary({ role: 'anonymous' }, false)
    expect(summary.show).toBe(false)
    expect(summary.detail).toBe('')
  })

  it('reports the verified identity: role, prefix, scopes and their source', () => {
    const summary = identitySummary(
      { role: 'admin', keyPrefix: 'zl_ab12', scopes: ['apikey:manage', 'settings:write'] },
      true,
    )
    expect(summary.show).toBe(true)
    expect(summary.tone).toBe('ok')
    expect(summary.title).toBe('Signed in')
    expect(summary.detail).toContain('Admin')
    expect(summary.detail).toContain('zl_ab12')
    expect(summary.scopes).toEqual(['apikey:manage', 'settings:write'])
    expect(summary.source).toMatch(/GET \/auth\/me/)
  })

  it('warns — never claims success — when a stored key is not recognised', () => {
    const summary = identitySummary({ role: 'anonymous', keyPrefix: null, scopes: [] }, true)
    expect(summary.show).toBe(true)
    expect(summary.tone).toBe('warn')
    expect(summary.title).toMatch(/not recognised/i)
    expect(summary.scopes).toEqual([])
  })

  it('tolerates an identity with no scopes array at all', () => {
    const summary = identitySummary({ role: 'member' }, true)
    expect(summary.scopes).toEqual([])
    expect(summary.tone).toBe('ok')
  })

  it('reports the identity a session earned, with no key in the browser', () => {
    // The only reason the panel had for appearing was "there is a stored key",
    // and password sign-in *clears* the key — so the page went silent on the
    // credential the server had just accepted.
    const summary = identitySummary(
      { role: 'member', keyPrefix: null, scopes: ['rag:read'], authSource: 'session', username: 'alice' },
      false,
    )
    expect(summary.show).toBe(true)
    expect(summary.tone).toBe('ok')
    expect(summary.detail).toContain('alice')
    expect(summary.scopes).toEqual(['rag:read'])
    // A session role does not come from a key's scopes, and the page that says
    // where its numbers came from must not imply otherwise.
    expect(summary.source).toMatch(/auth_source=session/)
    expect(summary.source).not.toMatch(/from the key’s scopes/)
  })

  it('names the browser, not an invented username, when the server sends none', () => {
    const summary = identitySummary({ role: 'admin', authSource: 'session', username: '   ' }, false)
    expect(summary.detail).toContain('this browser')
    expect(summary.detail).not.toContain('   ')
  })

  it('keeps warning about a stored key the server refuses', () => {
    // `anonymous` is also what the tolerant schema answers for a server that
    // reports no source at all, so the key branch still needs the local fact.
    const summary = identitySummary(
      { role: 'anonymous', keyPrefix: null, scopes: [], authSource: 'anonymous' },
      true,
    )
    expect(summary.tone).toBe('warn')
    expect(summary.title).toMatch(/not recognised/i)
  })
})
