import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProviderCatalog, modelPlaceholder, modelsFor, postRefreshModels } from './api'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A public catalog row — five fields, zero secrets (the server's projection). */
function row(overrides: Record<string, unknown> = {}) {
  return {
    catalog_id: 'primary',
    name: 'Primary',
    adapter: 'brain',
    models: ['model-a', 'model-b'],
    selected_model: 'model-a',
    ...overrides,
  }
}

function lastCall(mock: { mock: { calls: readonly unknown[][] } }): [string, RequestInit] {
  return mock.mock.calls.at(-1) as [string, RequestInit]
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => json({ items: [], count: 0 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchProviderCatalog', () => {
  it('GETs the public catalog with no body and no key requirement', async () => {
    fetchMock.mockImplementation(async () => json({ items: [row()], count: 1 }))

    const catalog = await fetchProviderCatalog()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/providers')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(catalog.count).toBe(1)
    expect(catalog.items[0]?.catalog_id).toBe('primary')
    // The public projection never carries admin bookkeeping or a secret.
    expect(catalog.items[0]).not.toHaveProperty('secret')
    expect(catalog.items[0]).not.toHaveProperty('enabled')
    expect(catalog.items[0]).not.toHaveProperty('is_active')
  })

  it('tolerates a malformed body instead of breaking the composer', async () => {
    fetchMock.mockImplementation(async () => json({ items: null }))
    await expect(fetchProviderCatalog()).resolves.toMatchObject({ items: [], count: 0 })
  })
})

describe('postRefreshModels', () => {
  it('POSTs to the admin refresh-models route with an empty body', async () => {
    fetchMock.mockImplementation(async () =>
      json({ catalog_id: 'primary', models: ['model-a'], source: 'remote' }),
    )

    const result = await postRefreshModels('primary')

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/ai-providers/primary/refresh-models')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(result.source).toBe('remote')
    expect(result.models).toEqual(['model-a'])
  })

  it('keeps an honest `catalog` source when the fetch could not run', async () => {
    fetchMock.mockImplementation(async () =>
      json({ catalog_id: 'primary', models: ['model-a'], source: 'catalog' }),
    )

    const result = await postRefreshModels('primary')

    expect(result.source).toBe('catalog')
  })

  it('surfaces an honest 403 when the key lacks settings:write', async () => {
    fetchMock.mockImplementation(async () => json({ detail: { error: 'forbidden' } }, 403))
    await expect(postRefreshModels('primary')).rejects.toThrow(/forbidden/)
  })
})

describe('modelsFor', () => {
  it('lists the models of the chosen provider', () => {
    const items = [row(), row({ catalog_id: 'secondary', models: ['other'] })]
    expect(modelsFor(items, 'primary')).toEqual(['model-a', 'model-b'])
    expect(modelsFor(items, 'secondary')).toEqual(['other'])
  })

  it('returns [] for a provider that is not in the catalog', () => {
    expect(modelsFor([row()], 'missing')).toEqual([])
  })

  it('offers every model the Brain publishes, not a truncated or seeded subset', () => {
    // Captured from `GET /api/v1/providers` on the live deployment. The Brain
    // serves nine; the picker used to offer four because discovery was disabled
    // for that row and only the hardcoded seed was reachable.
    const brain = row({
      catalog_id: 'pcore-brain',
      name: 'P-Core Brain',
      models: [
        'opencode/space-bunny-free',
        'opencode/nemotron-3-ultra-free',
        'opencode/nemotron-3.5-lightning-free',
        'opencode/mimo-v2.6-flash-free',
        'opencode/muse-spark-1.3-contributor-free',
        'opencode/ling-3.0-flash-fin-free',
        'opencode/longcat-2.5-preview-free',
        'opencode/big-pickle',
        'auto',
      ],
    })
    const models = modelsFor([brain], 'pcore-brain')
    expect(models).toHaveLength(9)
    expect(models).toContain('opencode/space-bunny-free')
    expect(models).toContain('auto')
  })

  it('preserves the server ordering so the fast default stays first', () => {
    // `resolve_model` falls back to `models[0]`; the Brain's `auto` router takes
    // ~35s against ~2s for a named model, so it must not lead the list.
    const brain = row({ catalog_id: 'pcore-brain', models: ['opencode/space-bunny-free', 'auto'] })
    const models = modelsFor([brain], 'pcore-brain')
    expect(models[0]).toBe('opencode/space-bunny-free')
  })
})

describe('modelPlaceholder (honest model picker hint)', () => {
  it('asks for a provider first when none is chosen — not "nothing published"', () => {
    expect(modelPlaceholder('', [])).toBe('Select a provider first')
  })

  it('says a chosen provider published no models', () => {
    expect(modelPlaceholder('primary', [])).toBe('No model list published')
  })

  it('invites a model pick once a provider with models is chosen', () => {
    expect(modelPlaceholder('primary', ['model-a', 'model-b'])).toBe('Select a model…')
  })
})
