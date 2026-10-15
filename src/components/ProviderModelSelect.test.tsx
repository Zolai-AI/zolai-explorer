/**
 * Markup guards for the public provider/model picker, emitted as static markup
 * through `react-dom/server` (the `TopBar.test.tsx` pattern — no DOM needed).
 *
 * The regression these pin: the picker's only refresh control was the admin
 * `settings:write` discovery action, so a keyed member who had just added or
 * used a key was stuck with whatever catalog the client had cached. Re-reading
 * `GET /api/v1/providers` is anon-safe and therefore belongs to **every** role,
 * visibly distinct from the admin action — a different, server-side thing that
 * keeps its gate.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Role } from '../lib/auth'
import { ProviderModelSelect } from './ProviderModelSelect'

// The role the server reported and the catalog answer are the inputs under
// test, so those are the two things stubbed. `can` stays real — the admin gate
// must be derived from the role, not from the test.
const useRoleMock = vi.hoisted(() => vi.fn<() => Role>())
vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>()
  return { ...actual, useRole: useRoleMock }
})

const useProviderCatalogMock = vi.hoisted(() => vi.fn())
vi.mock('../features/providers/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/providers/api')>()
  return { ...actual, useProviderCatalog: useProviderCatalogMock }
})

const ANON: Role = 'anonymous'
const MEMBER: Role = 'member'
const ADMIN: Role = 'admin'

/** A resolved public catalog row — the five projected fields, zero secrets. */
const CATALOG = {
  items: [
    {
      catalog_id: 'primary',
      name: 'Primary',
      adapter: 'brain',
      models: ['model-a', 'model-b'],
      selected_model: 'model-a',
    },
  ],
  count: 1,
}

function resolvedCatalog(overrides: Record<string, unknown> = {}) {
  return {
    data: CATALOG,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(async () => ({ isError: false })),
    ...overrides,
  }
}

function render(role: Role, catalog: Record<string, unknown> = resolvedCatalog()): string {
  useRoleMock.mockReturnValue(role)
  useProviderCatalogMock.mockReturnValue(catalog)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ProviderModelSelect value={{ provider: '', model: '' }} onChange={() => {}} />
    </QueryClientProvider>,
  )
}

describe('Re-fetch catalog — the public read every role may repeat', () => {
  it('offers it to a keyed member, who cannot reach the admin action', () => {
    const html = render(MEMBER)

    expect(html).toContain('Re-fetch catalog')
    // No admin affordance leaks to a role the server did not grant.
    expect(html).not.toContain('Refresh models')
    expect(html).not.toContain('settings:write')
  })

  it('offers it to an anonymous visitor too — the catalog needs no key', () => {
    const html = render(ANON)

    expect(html).toContain('Re-fetch catalog')
    expect(html).not.toContain('Refresh models')
  })

  it('stays visible beside the admin action for an admin', () => {
    const html = render(ADMIN)

    expect(html).toContain('Re-fetch catalog')
    expect(html).toContain('Refresh models')
    // Two controls, two honest titles: a public re-read versus the
    // server-side discovery that needs settings:write. (The apostrophe in the
    // admin title is HTML-escaped in the emitted attribute, hence the tail.)
    expect(html).toContain('Re-fetch the public provider catalog (any role)')
    expect(html).toContain('model list (admin, settings:write)')
  })

  it('shows a busy label while the catalog re-fetch is in flight', () => {
    const html = render(MEMBER, resolvedCatalog({ isFetching: true }))

    expect(html).toContain('Re-fetching…')
    // The whole control is disabled while the request runs, not just relabelled.
    const tag = html.match(
      /<button[^>]*title="Re-fetch the public provider catalog \(any role\)"[^>]*>/,
    )?.[0]
    expect(tag, 'public re-fetch button not found').toBeTruthy()
    expect(tag).toContain('disabled=""')
  })

  it('does not offer it before the catalog has answered — the error state carries the retry', () => {
    const html = render(MEMBER, {
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(async () => ({ isError: false })),
    })

    expect(html).toContain('Loading providers…')
    expect(html).not.toContain('Re-fetch catalog')
    expect(html).not.toContain('Refresh models')
  })
})
