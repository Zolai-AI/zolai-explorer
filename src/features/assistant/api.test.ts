import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_TIMEOUT_MS, assistantChatPath, postAssistantChat } from './api'
import { ApiError } from '../../lib/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const RETRIEVAL_ONLY = {
  answer: 'pasian means God',
  citations: [{ source: 'dictionary', ref: 'pasian', text: 'God', score: 0.9 }],
  tool_calls: [],
  turns: 1,
  provider: '',
  model: '',
  mode: 'retrieval_only',
  retrieval_only: true,
  latency_ms: 6,
  zvs: {},
  provider_error: '',
  loop_error: '',
  persisted_run_id: null,
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

describe('assistantChatPath', () => {
  it('routes public chat to the anonymous-safe path', () => {
    // /assistant/chat is in rbac.PUBLIC_ROUTES — it must work with no key.
    expect(assistantChatPath('public')).toBe('/assistant/chat')
  })

  it('routes admin chat to the strict path', () => {
    expect(assistantChatPath('admin')).toBe('/admin/assistant/chat')
  })
})

describe('postAssistantChat', () => {
  it('POSTs the message to the public route and parses citations', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RETRIEVAL_ONLY))

    const res = await postAssistantChat('what is pasian?')

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/assistant/chat')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"message":"what is pasian?"}')
    expect(res.retrieval_only).toBe(true)
    expect(res.citations[0].ref).toBe('pasian')
  })

  it('defaults to the public route when no mode is passed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RETRIEVAL_ONLY))

    await postAssistantChat('pasian?')

    expect(lastCall()[0]).toBe('/api/v1/assistant/chat')
  })

  it('POSTs to the admin route when asked', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...RETRIEVAL_ONLY, retrieval_only: false }))

    await postAssistantChat('hi', 'admin')

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/admin/assistant/chat')
    expect(init.method).toBe('POST')
  })

  it('asks for a longer budget than the default 15s (server allows 60s)', () => {
    // Regression guard: a slow retrieval answer must not surface as a
    // client-side timeout at the 15s default.
    expect(ASSISTANT_TIMEOUT_MS).toBeGreaterThan(15_000)
    expect(ASSISTANT_TIMEOUT_MS).toBeLessThanOrEqual(60_000)
  })

  it('keeps retrieval_only=true through parsing so the UI can label honestly', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RETRIEVAL_ONLY))

    const res = await postAssistantChat('pasian?')

    expect(res.retrieval_only).toBe(true)
    expect(res.provider).toBe('')
    expect(res.model).toBe('')
  })

  it('surfaces a 401 from the admin route as an ApiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'admin role required' }, 401))

    await expect(postAssistantChat('hi', 'admin')).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 401,
    )
  })
})
