import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RUN_TIMEOUT_MS,
  fetchAgentRun,
  postAgentRun,
  postRunFeedback,
} from './api'
import { ApiError } from '../../lib/api'
import { REQUEST_TIMEOUT_MS } from '../../lib/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Verbatim status vocabulary from `zolai.agent.orchestrator`:
// run.status ∈ running | succeeded | failed; phases.* ∈ ok | failed | skipped.
const RUNNING_RUN = {
  id: 7,
  goal: 'audit ZVS forms',
  status: 'running',
  phases: {},
  tool_calls: [],
  evidence: [],
  answer: '',
  provider: 'pcore-brain',
  model: 'free-1',
  turns: 1,
  latency_ms: 0,
  outcome: '',
  feedback_score: null,
  error: '',
  mode: 'rule',
  created_by: 'key:zl_ab',
  created_at: '2026-10-04T10:00:00Z',
  finished_at: null,
}

const SUCCEEDED_RUN = {
  ...RUNNING_RUN,
  status: 'succeeded',
  answer: 'done',
  outcome: 'generated',
  phases: { shipped: { status: 'ok', tools: [], evidence_count: 0, outcome: '', latency_ms: 0, error: '' } },
  finished_at: '2026-10-04T10:01:00Z',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit]
}

describe('run timeout budget', () => {
  it('gives the synchronous run more than the default 15s budget', () => {
    // POST /agent/runs runs the whole loop server-side (≤60s), so the default
    // REQUEST_TIMEOUT_MS would abort a perfectly healthy run.
    expect(RUN_TIMEOUT_MS).toBeGreaterThan(REQUEST_TIMEOUT_MS)
    expect(RUN_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000)
  })
})

describe('postAgentRun', () => {
  it('POSTs the goal to /agent/runs with the extended timeout', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SUCCEEDED_RUN))

    const run = await postAgentRun('audit ZVS forms')

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/agent/runs')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"goal":"audit ZVS forms"}')
    expect(run.id).toBe(7)
    expect(run.status).toBe('succeeded')
  })

  it('surfaces a 429 (5 runs/min rate limit) as an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: 'rate limit: 5 runs/min' }, 429),
    )

    await expect(postAgentRun('x')).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 429,
    )
  })

  it('surfaces a 403 when the key lacks agent:run', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'missing agent:run scope' }, 403))

    await expect(postAgentRun('x')).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 403,
    )
  })
})

describe('fetchAgentRun', () => {
  it('GETs one run by id and parses its phase table', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...SUCCEEDED_RUN,
        phases: {
          research: {
            status: 'ok',
            tools: ['kb_search'],
            evidence_count: 3,
            outcome: '',
            latency_ms: 40,
            error: '',
          },
        },
      }),
    )

    const run = await fetchAgentRun(7)

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/agent/runs/7')
    expect(init.method ?? 'GET').toBe('GET')
    expect(run.phases.research.evidence_count).toBe(3)
  })

  it('404s honestly on a run that does not exist', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'run not found' }, 404))

    await expect(fetchAgentRun(999)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 404,
    )
  })
})

describe('postRunFeedback', () => {
  it('POSTs a thumbs-up score and parses the learn outcome', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        run_id: 7,
        feedback_score: 1,
        run: SUCCEEDED_RUN,
        learn: { created_hypothesis_id: 12 },
      }),
    )

    const result = await postRunFeedback(7, 1)

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/agent/runs/7/feedback')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"score":1}')
    expect(result.feedback_score).toBe(1)
    expect(result.learn.created_hypothesis_id).toBe(12)
  })

  it('POSTs a thumbs-down score as -1', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ run_id: 7, feedback_score: -1, run: SUCCEEDED_RUN, learn: {} }),
    )

    await postRunFeedback(7, -1)

    expect(lastCall()[1].body).toBe('{"score":-1}')
  })
})
