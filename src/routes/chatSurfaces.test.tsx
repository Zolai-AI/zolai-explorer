/**
 * Render guards for the two surfaces users kept reporting as broken: the
 * sign-in form (password field + its eye toggle) and the assistant composer
 * (a usable chatbox that needs no pasted key).
 *
 * These render through `react-dom/server` — no DOM implementation needed — and
 * assert on the emitted markup, so a regression that hides a control (or buries
 * it under other panels) fails the build instead of reaching production.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { Login } from './Login'
import { Assistant, answerFrameCopy, ToolsPanel } from './Assistant'
import type { ChatResponse } from '../lib/schemas'

function render(ui: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Login — the credential a human actually holds', () => {
  const html = render(<Login />)

  it('leads with the username + password form, not the API-key form', () => {
    expect(html).toContain('id="login-password"')
    expect(html).toContain('id="login-username"')
    // The API-key card is the secondary path and is NOT on screen by default.
    expect(html).not.toContain('id="login-key"')
    expect(html).toContain('Use an API key instead')
  })

  it('renders a show/hide eye toggle wired to the password field', () => {
    // The password input starts masked and the toggle is a real button labelled
    // for the action it performs — both are what "the eye is missing" meant.
    // Attribute order follows the shadcn <Input> (type before id).
    expect(html).toMatch(/type="password"[^>]*id="login-password"/)
    expect(html).toMatch(/type="button"[^>]*aria-label="Show password"/)
    // The icon itself must be in the tree, not just the label.
    expect(html).toContain('lucide-eye')
  })

  it('masks the password by default and never echoes its value', () => {
    expect(html).not.toMatch(/type="text"[^>]*id="login-password"/)
  })
})

describe('Assistant — the chatbox is the page', () => {
  const html = render(<Assistant />)

  it('renders a message box and a Send button above the fold', () => {
    expect(html).toContain('id="assistant-message"')
    expect(html).toContain('<textarea')
    expect(html).toMatch(/type="submit"[^>]*>.*?Send/s)
  })

  it('needs no API key to send: nothing is gated behind a key field', () => {
    // The whole point — an anonymous visitor can chat. A pasted key stays
    // optional and lives behind a collapsed disclosure.
    expect(html).not.toContain('id="assistant-api-key"')
    expect(html).toContain('Provider options')
  })

  it('keeps the provider override collapsed by default', () => {
    expect(html).not.toContain('id="assistant-target-provider"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('does not clip the page into a fixed-height, unscrollable box', () => {
    // `max-h-[calc(100vh-8rem)]` with no scroll container pushed the composer
    // below the fold on short viewports.
    expect(html).not.toContain('calc(100vh-8rem)')
  })

  it('tells the visitor no key is needed', () => {
    expect(html).toMatch(/No key needed/i)
  })
})

describe('answerFrameCopy — what the answer card says it is', () => {
  const response = (overrides: Partial<ChatResponse> = {}): ChatResponse => ({
    answer: 'a',
    citations: [],
    tool_calls: [],
    turns: 0,
    provider: '',
    model: '',
    requested_provider: '',
    requested_model: '',
    requested_api_key: false,
    requested_user_provider: false,
    mode: 'rule',
    retrieval_only: true,
    generation_requires_auth: false,
    latency_ms: 1,
    zvs: {},
    provider_error: '',
    loop_error: '',
    persisted_run_id: null,
    ...overrides,
  })

  it('labels a retrieval answer as retrieval, never as generated', () => {
    const copy = answerFrameCopy(response(), false, false)
    expect(copy.title).toBe('Retrieval (no model)')
    expect(copy.subtitle).toContain('no active provider')
  })

  it('names the credential as the missing piece when the server says so', () => {
    // The flag means *a credential was missing*, not "signing in will
    // generate": the deployment may also have no provider. So the copy names
    // the anonymous gate and never claims a provider exists or is reachable.
    const copy = answerFrameCopy(response({ generation_requires_auth: true }), false, false)
    expect(copy.title).toBe('Retrieval (anonymous request)')
    expect(copy.subtitle).toContain('anonymous request')
    expect(copy.subtitle).toContain('signed-in credential')
    expect(copy.subtitle).not.toContain('no active provider')
    expect(copy.subtitle).not.toContain('sign in to generate')
  })

  it('names the provider and model that actually answered', () => {
    const copy = answerFrameCopy(
      response({ retrieval_only: false, provider: 'gemini', model: 'gemini-flash' }),
      false,
      false,
    )
    expect(copy.title).toBe('Answer')
    expect(copy.subtitle).toBe('gemini · gemini-flash')
  })

  it('renders a dash rather than a label the payload did not carry', () => {
    const copy = answerFrameCopy(response({ retrieval_only: false }), false, false)
    expect(copy.subtitle).toBe('— · —')
  })

  it('describes the waiting, failed and empty states without a response', () => {
    expect(answerFrameCopy(undefined, true, false).subtitle).toBe('waiting for the server')
    expect(answerFrameCopy(undefined, false, true).subtitle).toBe(
      'the last request did not complete',
    )
    expect(answerFrameCopy(undefined, false, false).subtitle).toBe('no question sent yet')
  })
})


describe('ToolsPanel — the trace behind the answer', () => {
  const calls = [
    {
      name: 'dictionary_lookup',
      ok: true,
      status: 'completed',
      latency_ms: 4,
      turn: 1,
      input: { word: 'pasian' },
      data: { word: 'pasian', meaning: 'God' },
      error: '',
      error_code: '',
    },
  ]

  it('shows tool calls to a public caller, under a plain title', () => {
    // The public assistant runs the retrieval tools too; hiding their trace
    // made the calls invisible to the visitor who asked the question.
    const html = renderToStaticMarkup(<ToolsPanel calls={calls} mode="public" />)
    expect(html).toContain('Tools used')
    expect(html).toContain('run by the assistant')
    expect(html).toContain('dictionary_lookup')
    expect(html).toContain('result — 2 fields')
  })

  it('names the admin trace as the inspector the same rows feed', () => {
    const html = renderToStaticMarkup(<ToolsPanel calls={calls} mode="admin" />)
    expect(html).toContain('Tool trace')
    expect(html).toContain('admin inspector')
    expect(html).toContain('dictionary_lookup')
  })
})
