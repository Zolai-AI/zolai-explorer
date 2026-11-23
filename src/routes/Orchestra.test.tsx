/**
 * Render guards for `/orchestra` — the page that surfaces the multi-agent
 * learning system.
 *
 * These render through `react-dom/server` (no DOM implementation), with the
 * query cache pre-filled so the **empty** state is the thing under test: the
 * roster, the skill catalog and the assignment list all empty at once is the
 * first thing a real visitor sees on a deployment that seeds nothing.
 *
 * The regressions pinned here:
 *   - the destination exists in the registry and is wired into the router's
 *     `PAGES` map (a registry record with no panel is an unreachable page);
 *   - the page renders without throwing when every read comes back empty;
 *   - the admin writes are invisible to an anonymous visitor and present for an
 *     admin — a control that 401s on click is worse than no control.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Orchestra, RunResult } from './Orchestra'
import { LEARNING_KEYS } from '../features/learning/api'
import { ApiError } from '../lib/api'
import { inPalette, pathOf, routeById, routeByPath } from '../lib/routes'
import type { AuthMe, LearningRun } from '../lib/schemas'

// Identity is the input under test, so it is the thing that gets stubbed —
// `can()` / `roleBadge()` stay real, so the gate must be derived, not faked.
// `useRole` is what the page reads (the sidebar uses it too), so it is the hook
// that is replaced; `useAuthMe` follows it for the same mock surface.
const useAuthMeMock = vi.hoisted(() => vi.fn())
const useRoleMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>()
  return {
    ...actual,
    useAuthMe: useAuthMeMock,
    useRole: () => useRoleMock(),
  }
})

const APP_SOURCE = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8')

const ORCHESTRA_SOURCE = readFileSync(
  fileURLToPath(new URL('./Orchestra.tsx', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const ANON: AuthMe = {
  role: 'anonymous',
  key_prefix: null,
  scopes: [],
  mode: '',
  auth_source: 'anonymous',
  username: null,
}

const ADMIN: AuthMe = { ...ANON, role: 'admin', key_prefix: 'zl_l-live-3456' }

/** The empty registry: nothing registered, nothing published, nothing bound. */
const EMPTY: Record<string, unknown> = {
  overview: {
    agents_total: 0,
    agents_enabled: 0,
    agents_disabled: 0,
    skills_total: 0,
    roles: {},
    seeded_defaults: [],
    agents: [],
  },
  agents: { agents: [] },
  skills: { skills: [] },
  assistants: { assistants: [] },
  bindings: { bindings: [] },
}

/** Cache key per seed, so a seed reads by what it is rather than by its key. */
const CACHE_KEYS: Record<string, readonly unknown[]> = {
  overview: LEARNING_KEYS.overview,
  agents: LEARNING_KEYS.agents,
  skills: LEARNING_KEYS.skills,
  assistants: LEARNING_KEYS.assistants,
  bindings: LEARNING_KEYS.bindings(),
}

function render(seed: Record<string, unknown> = EMPTY): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Pre-fill the cache: `react-dom/server` runs no effects, so a query only
  // ever renders from what is already there. This is what makes the empty state
  // reachable in a static render at all.
  for (const [name, value] of Object.entries(seed)) {
    client.setQueryData(CACHE_KEYS[name], value)
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Orchestra />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** One agent, so the admin controls have a row to live on. */
const ONE_AGENT = {
  agents: [
    {
      agent_id: 'bible_learner_001',
      name: 'BibleLearner',
      role: 'bible_learner',
      skills: ['bible_pattern_extraction'],
      enabled: true,
      config: { bible_priority: true, confidence_threshold: 0.85 },
      created_at: '',
      updated_at: '',
    },
  ],
}

beforeEach(() => {
  useAuthMeMock.mockReturnValue(ANON)
  useRoleMock.mockReturnValue(ANON.role)
})

/** Render the page as the role the server reported. */
function asAdmin(): void {
  useAuthMeMock.mockReturnValue(ADMIN)
  useRoleMock.mockReturnValue(ADMIN.role)
}

describe('route registry — the destination must be reachable', () => {
  it('registers /orchestra as a public, nav destination', () => {
    const spec = routeById('orchestra')
    expect(spec).toBeDefined()
    expect(spec?.path).toBe('/orchestra')
    // Every read the page renders is unscoped server-side, so gating the page
    // would hide the read-only view from exactly the people it is for.
    expect(spec?.minRole).toBe('anonymous')
    expect(spec?.nav).toBe(true)
    expect(spec?.icon).toBe('network')
    expect(spec?.keywords.length).toBeGreaterThan(3)
  })

  it('is reachable through the lookup helpers and the ⌘K palette', () => {
    expect(pathOf('orchestra')).toBe('/orchestra')
    expect(routeByPath('/orchestra')?.id).toBe('orchestra')
    expect(inPalette(routeByPath('/orchestra')!)).toBe(true)
  })

  it('is wired into the router PAGES map', () => {
    // `PAGES` is typed over `RoutePath`, so this is also a compile error
    // without the entry — the assertion is the belt to that braces.
    expect(APP_SOURCE).toMatch(/^ {2}'\/orchestra': <Orchestra \/>,/m)
  })
})

describe('Orchestra — empty state', () => {
  const html = render()

  it('renders every section without throwing when nothing is registered', () => {
    expect(html).toContain('Orchestra')
    expect(html).toContain('Team')
    expect(html).toContain('Skill catalog')
    expect(html).toContain('Run a task')
    expect(html).toContain('Assignments')
  })

  it('says the roster is empty rather than showing a blank panel', () => {
    expect(html).toContain('No agents in the registry')
    expect(html).toContain('No skills published')
  })

  it('handles the no-assistants case in words, not with an empty box', () => {
    expect(html).toContain('No assistant surfaces yet')
  })

  it('offers the task runner with the documented anonymous ceiling stated', () => {
    expect(html).toContain('anonymous callers are clamped to limit 50')
    expect(html).toContain('Run task')
  })

  it('shows the role histogram only when the server sent roles', () => {
    // The "Roles" *tile* always renders (it counts roles, zero included); the
    // histogram card must not, or an empty registry grows a card saying nothing.
    expect(html).not.toContain('agents per role')
  })
})

describe('Orchestra — the write controls follow the reported role', () => {
  const cache = { ...EMPTY, agents: ONE_AGENT }

  it('shows a non-admin a read-only roster instead of buttons that would 401', () => {
    const html = render(cache)
    expect(html).toContain('BibleLearner')
    expect(html).toContain('Read-only view')
    expect(html).not.toContain('aria-label="Enable BibleLearner"')
    expect(html).not.toContain('Threshold (0–1)')
  })

  it('gives an admin the enable switch and the threshold editor', () => {
    asAdmin()
    const html = render(cache)
    expect(html).toContain('aria-label="Enable BibleLearner"')
    expect(html).toContain('Threshold (0–1)')
    // The seeded threshold is shown as the server's number, not as a blank.
    expect(html).toContain('0.85')
  })

  it('keeps the agent id and its skills visible in both roles', () => {
    const html = render(cache)
    expect(html).toContain('bible_learner_001')
    expect(html).toContain('Bible pattern extraction')
  })
})

describe('Orchestra — a deployment without the assignment routes', () => {
  it('states that assignments are unavailable instead of showing an empty list', () => {
    asAdmin()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    for (const [name, value] of Object.entries(EMPTY)) {
      client.setQueryData(CACHE_KEYS[name], value)
    }
    // The cache API is the only way to reach an error state without a DOM:
    // build the query, then hand it the failure the server really returns.
    const notFound = new ApiError('Not found', 404, '/api/v1/learning/assistants', 'http')
    for (const key of [CACHE_KEYS.assistants, CACHE_KEYS.bindings]) {
      const query = client.getQueryCache().build(client, {
        queryKey: key,
        queryFn: async () => ({ assistants: [], bindings: [] }),
      })
      query.setState({ status: 'error', error: notFound, fetchStatus: 'idle' })
    }

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Orchestra />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('Assistant assignments are not available on this deployment')
    expect(html).not.toContain('No assistant surfaces yet')
  })
})

describe('RunResult — the panel reads what the task actually returned', () => {
  function renderResult(result: LearningRun): string {
    return renderToStaticMarkup(<RunResult result={result} />)
  }

  it('shows the collocation payload under its real keys', () => {
    // `_extract_collocations` returns `{total_collocations, top_collocations[]}`;
    // reading `entries`/`vocabulary_size` (the old map) produced an empty panel.
    const html = renderResult({
      task: 'extract_collocations',
      result: {
        total_collocations: 7,
        top_collocations: [{ word1: 'pasian', word2: 'itna', frequency: 3 }],
      },
      limit_applied: 10,
      limit_clamped: false,
    })

    expect(html).toContain('total collocations')
    expect(html).toContain('Word1')
    expect(html).toContain('pasian')
    expect(html).not.toContain('The task returned no fields')
  })

  it('shows the corrected sentence and the change count, not an absent confidence', () => {
    const html = renderResult({
      task: 'correct_grammar',
      result: { original: 'ka hi', corrected: 'ka hi hi', changes: 1, is_valid: false },
      limit_applied: 10,
      limit_clamped: false,
    })

    expect(html).toContain('>changes<')
    expect(html).toContain('ka hi hi')
    expect(html).not.toContain('>confidence<')
  })

  it('renders a 200-with-error payload as the error it is', () => {
    const html = renderResult({
      task: 'translate',
      result: { error: 'No source_text provided' },
      limit_applied: 10,
      limit_clamped: false,
    })

    expect(html).toContain('The task answered with an error')
    expect(html).toContain('No source_text provided')
    expect(html).not.toContain('The task returned no fields')
  })

  it('keeps a score’s decimals instead of truncating it to a count', () => {
    const html = renderResult({
      task: 'translate',
      result: { translation: 'chang', source_lang: 'en', target_lang: 'zo', confidence: 0.85, cached: false },
      limit_applied: 10,
      limit_clamped: false,
    })

    expect(html).toContain('0.85')
    expect(html).not.toContain('<dd class="mt-0.5 text-sm break-words">0</dd>')
  })

  it('keeps the raw payload reachable even when the result is empty', () => {
    // The empty state promises "the raw payload below"; it must exist there.
    const html = renderResult({
      task: 'translate',
      result: {},
      limit_applied: 10,
      limit_clamped: false,
    })

    expect(html).toContain('The task returned no fields')
    expect(html).toContain('raw learning run')
  })
})

describe('Orchestra — a run-result cell never hides its value behind a tooltip (candidate #8)', () => {
  it('truncates through the shared disclosure, not a native title attribute', () => {
    // The result rows render only after a task runs, so this is a source guard:
    // a `title=` on any native element (a `<span>`/`<code>`/`<p>` cell) is the
    // hover-only pattern WCAG 1.4.13 forbids. `<Card title=…>`/`<Empty title=…>`
    // are visible-text props and are allowed, which is why the ban is scoped to
    // lowercase elements — the same boundary `Review.test.tsx` draws.
    expect(ORCHESTRA_SOURCE).not.toMatch(/<(?:span|div|p|code|kbd|svg|input|a)\b[^>]*\stitle=/i)
    expect(ORCHESTRA_SOURCE).toContain('TruncatedValue')
    expect(ORCHESTRA_SOURCE).not.toContain('max-w-[22rem] truncate')
  })
})