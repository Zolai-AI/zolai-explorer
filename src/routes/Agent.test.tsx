/**
 * A run has an address (candidate #11).
 *
 * `Agent.tsx` used to hold the finished run's id in `useState`, so run #412
 * could be described but not linked: nothing in the URL named it, a reload
 * dropped it, and "look at the run I just did" meant "re-run it yourself" —
 * which costs one of five runs per minute per credential.
 *
 * The id now lives in `?run=<digits>` and the page renders whatever the URL
 * asks for. These guards hold that shape:
 *
 *   - `runLink` is the one place the address is built, so the copy button, the
 *     docs, and a hand-typed link cannot drift apart;
 *   - the page reads the id **from the search params**, not from state, and a
 *     new run **pushes** (a record the operator asked for) where every view
 *     change elsewhere in the app replaces;
 *   - a stale POST answer may not shadow a pasted id — the run on screen is the
 *     URL's;
 *   - the loading and not-found branches **name the endpoint** they are waiting
 *     on, so a link to a run you cannot see tells you what was asked for;
 *   - the goal stays out of the address: prose in a bar is noise, and a pasted
 *     goal invites running it again by accident.
 *
 * The Node test environment has no DOM, so the page shape is guarded as source
 * (the same split `Word.test.tsx` uses) and the URL arithmetic is guarded
 * directly as a pure function.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runLink } from './Agent'
import { agentSearch, pathOf } from '../lib/routes'

const SOURCE = readFileSync(fileURLToPath(new URL('./Agent.tsx', import.meta.url)), 'utf8')

/** Put a `window` where the Node environment has none, and take it away again. */
function withWindow(origin: string, run: () => string): string {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin } },
    configurable: true,
    writable: true,
  })
  try {
    return run()
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
}

describe('runLink', () => {
  it('builds the address from the route registry and the run codec', () => {
    // One source of truth: the path comes from `pathOf('agent')` and the query
    // from `agentSearch`, so relabelling the route cannot orphan old links.
    expect(runLink(412)).toBe(`${pathOf('agent')}?${agentSearch(412)}`)
    expect(runLink(412)).toBe('/agent?run=412')
  })

  it('carries digits only — nothing a serializer could escape', () => {
    for (const id of [1, 7, 42, 412, 9999, 123456789]) {
      const link = runLink(id)
      expect(link, String(id)).toBe(`/agent?run=${id}`)
      expect(link, String(id)).not.toContain('%')
    }
  })

  it('stays relative where no document exists to resolve against', () => {
    // Under the Node environment there is no `window`, so the function must not
    // throw and must not invent an origin it cannot know.
    expect(runLink(412)).toBe('/agent?run=412')
  })

  it('goes absolute when a document supplies an origin', () => {
    // The copy button hands someone a link that works outside this tab, so it
    // has to carry the host.
    const link = withWindow('https://studio.zolai.space', () => runLink(412))
    expect(link).toBe('https://studio.zolai.space/agent?run=412')
    expect(new URL(link).searchParams.get('run')).toBe('412')
  })

  afterEach(() => {
    expect('window' in globalThis).toBe(false)
  })
})

describe('the run page reads its id from the URL', () => {
  it('derives the run from the search params, not from component state', () => {
    expect(SOURCE).toContain('const runId = agentRunFromSearch(searchParams)')
    // The old shape must not come back: an id in state is unlinkable and dies on
    // reload, which is the whole defect.
    expect(SOURCE).not.toMatch(/useState<number \| null>/)
    expect(SOURCE).not.toMatch(/const \[runId, setRunId\]/)
  })

  it('pushes a new run, because a run is a record rather than a view', () => {
    const writeBlock = SOURCE.slice(
      SOURCE.indexOf('const showRun'),
      SOURCE.indexOf('const submit'),
    )
    // `setSearchParams` pushes by default; `/review` and `/word` opt into
    // `replace` because there the URL is a view. Passing `replace` here would
    // silently eat the previous run from history.
    expect(writeBlock).toContain('setSearchParams(params)')
    // No second argument at all: `{ replace: true }` would silently eat the
    // previous run from history.
    expect(writeBlock).not.toMatch(/setSearchParams\([^)]*,/)
    expect(writeBlock).toContain('params.set(AGENT_RUN_PARAM, String(id))')
  })

  it('refuses to let a stale POST answer shadow a pasted id', () => {
    // `?run=99` pasted into a tab that just finished run #412 must show #99.
    expect(SOURCE).toContain('run.data.id === runId')
    expect(SOURCE).toContain('const data = live.data ?? (run.data && run.data.id === runId')
  })

  it('names the endpoint it is waiting on, and the one it would have called', () => {
    // An Empty panel or a stuck loader must say which call is behind it — and say
    // it as a path a person can paste, not the registry's `API_BASE`-relative
    // template, which read as `GET /agent/runs/999` while the Dashboard printed
    // `/api/v1/...` for the same surface.
    expect(SOURCE).toContain("documentedPath('agent.run.read', { run_id: runId })")
    expect(SOURCE).toContain("documentedPath('agent.run.create')")
    expect(SOURCE).toMatch(/This page asked for `GET \{documentedPath\('agent\.run\.read'/)
    expect(SOURCE).not.toMatch(/POST \$\{endpointPath\(/)
  })

  it('hands the run panel a copyable link', () => {
    expect(SOURCE).toContain('<CopyValue value={runLink(run.id)}')
    expect(SOURCE).toMatch(/label="this run's link"/)
  })

  it('keeps the goal out of the address', () => {
    // The goal is an input: it stays in `useState` and travels only in the POST
    // body, so the one function that writes the query never sees it.
    expect(SOURCE).toContain("const [goal, setGoal] = useState('')")
    const writeBlock = SOURCE.slice(
      SOURCE.indexOf('const showRun'),
      SOURCE.indexOf('const submit'),
    )
    expect(writeBlock.length).toBeGreaterThan(0)
    expect(writeBlock).not.toMatch(/goal/i)
    expect(SOURCE).not.toMatch(/params\.set\(\s*['"]goal['"]/)
  })

  it('announces the loading branch as busy, not as an empty screen', () => {
    expect(SOURCE).toMatch(/runId !== null && live\.isPending/)
    expect(SOURCE).toMatch(/runId !== null && live\.isError/)
    expect(SOURCE).toContain('#${formatCount(runId)} · loading')
  })
})
