import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchProviderCatalog,
  modelPlaceholder,
  modelsFor,
  postRefreshModels,
  reconcileSelection,
} from './api'

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
    // Mirrors the row shape captured from `GET /api/v1/providers` on the live
    // deployment, with generic ids: nine entries (the `auto` router last), and
    // the picker used to offer four because discovery was disabled for that row
    // and only the hardcoded seed was reachable.
    const brain = row({
      catalog_id: 'primary',
      name: 'Primary',
      models: [
        'ns/model-a',
        'ns/model-b',
        'ns/model-c',
        'ns/model-d',
        'ns/model-e',
        'ns/model-f',
        'ns/model-g',
        'ns/model-h',
        'auto',
      ],
    })
    const models = modelsFor([brain], 'primary')
    expect(models).toHaveLength(9)
    expect(models).toContain('ns/model-a')
    expect(models).toContain('auto')
  })

  it('preserves the server ordering so the fast default stays first', () => {
    // `resolve_model` falls back to `models[0]`; the `auto` router takes
    // ~35s against ~2s for a named model, so it must not lead the list.
    const brain = row({ catalog_id: 'primary', models: ['ns/model-a', 'auto'] })
    const models = modelsFor([brain], 'primary')
    expect(models[0]).toBe('ns/model-a')
  })
})

/** A public catalog row as the picker sees it — the five projected fields. */
type PubRow = {
  catalog_id: string
  name: string
  adapter: string
  models: string[]
  selected_model: string
}

const pubRow = (overrides: Partial<PubRow> = {}): PubRow => ({
  catalog_id: 'primary',
  name: 'Primary',
  adapter: 'brain',
  models: ['model-a', 'model-b'],
  selected_model: 'model-a',
  ...overrides,
})

describe('reconcileSelection (fresh catalog vs. the controlled value)', () => {
  it('leaves an empty selection empty — "no override" is the server default', () => {
    expect(reconcileSelection([pubRow()], { provider: '', model: '' })).toEqual({
      provider: '',
      model: '',
    })
  })

  it('keeps a selection the catalog still publishes', () => {
    const value = { provider: 'primary', model: 'model-b' }
    expect(reconcileSelection([pubRow()], value)).toEqual(value)
  })

  it('drops to the server default when the provider left the catalog', () => {
    const other = pubRow({ catalog_id: 'secondary', models: ['other'] })
    expect(reconcileSelection([other], { provider: 'primary', model: 'model-a' })).toEqual({
      provider: '',
      model: '',
    })
  })

  it('drops to the server default when a fresh catalog publishes nothing', () => {
    expect(reconcileSelection([], { provider: 'primary', model: 'model-a' })).toEqual({
      provider: '',
      model: '',
    })
  })

  it('falls back to the row selected_model when the chosen model is gone', () => {
    // The row still publishes its own selected_model, so it wins — over the
    // model the user picked, which the server would reject, and over models[0],
    // which is not what the row is configured to serve.
    expect(reconcileSelection([pubRow()], { provider: 'primary', model: 'retired' })).toEqual({
      provider: 'primary',
      model: 'model-a',
    })
  })

  it('falls back to the first published model when selected_model is not in models', () => {
    // Exactly the payload that 400s with PROVIDER_MODEL_UNKNOWN — never trust
    // a declared selected_model the row does not actually publish.
    expect(
      reconcileSelection([pubRow({ selected_model: 'also-retired' })], {
        provider: 'primary',
        model: 'retired',
      }),
    ).toEqual({ provider: 'primary', model: 'model-a' })
  })

  it('falls back to the first published model when the row declares none', () => {
    expect(
      reconcileSelection([pubRow({ selected_model: '' })], { provider: 'primary', model: 'retired' }),
    ).toEqual({ provider: 'primary', model: 'model-a' })
  })

  it('falls back to an empty model when the row publishes no models at all', () => {
    expect(
      reconcileSelection([pubRow({ models: [], selected_model: '' })], {
        provider: 'primary',
        model: 'retired',
      }),
    ).toEqual({ provider: 'primary', model: '' })
  })

  it('matches pickProvider precedence for every shape of row', () => {
    // `pickProvider` in the picker computes, for the row it was handed:
    //   row.selected_model published ? row.selected_model : row.models[0] ?? ''
    // Reconciling a model the row no longer publishes must land on exactly the
    // same value — one precedence, not two.
    const pickProvider = (r: PubRow): string =>
      r.selected_model !== '' && r.models.includes(r.selected_model)
        ? r.selected_model
        : (r.models[0] ?? '')

    const rows = [
      pubRow(),
      pubRow({ selected_model: 'retired' }),
      pubRow({ selected_model: '' }),
      pubRow({ models: ['model-b'], selected_model: 'model-b' }),
      pubRow({ models: [], selected_model: 'retired' }),
    ]

    for (const r of rows) {
      expect(reconcileSelection([r], { provider: r.catalog_id, model: 'retired' })).toEqual({
        provider: r.catalog_id,
        model: pickProvider(r),
      })
    }
  })

  it('is a fixpoint — a reconciled value reconciles to itself, so the picker corrects once', () => {
    // The picker's mount effect (`ProviderModelSelect`) calls `onChange` only
    // when the reconciled value differs, and the parent then feeds that value
    // back as the controlled `value`. For the correction to be exactly one
    // call and never a loop, reconciling the reconciled value must be the
    // identity — for every shape of stale selection against every catalog
    // that could have retired it.
    const stale = [
      { provider: 'primary', model: 'retired' }, // a model the row no longer publishes
      { provider: 'primary', model: '' }, // a provider chosen with no model yet
      { provider: 'vanished', model: 'model-a' }, // the provider left the catalog
    ]
    const catalogs = [
      [pubRow()],
      [pubRow({ selected_model: '' })],
      [pubRow({ models: [], selected_model: '' })],
      [pubRow({ catalog_id: 'secondary', models: ['other'] })],
    ]

    for (const items of catalogs) {
      for (const value of stale) {
        const once = reconcileSelection(items, value)
        expect(reconcileSelection(items, once)).toEqual(once)
      }
    }
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
