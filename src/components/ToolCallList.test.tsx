/**
 * What one tool call says it did.
 *
 * The assistant and the agent run page share this list, so a trace that hides
 * its arguments or its result is hidden on both. These specs pin the facts a
 * function call has to carry — name, status, arguments, result or error — and
 * the disclosure labels that keep the payload one click away.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { describeToolInput, describeToolResult, ToolCallList } from './ToolCallList'
import type { ToolCall } from '../lib/schemas'

function call(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    name: 'rag_search',
    ok: true,
    status: 'completed',
    latency_ms: 12,
    turn: 1,
    input: { query: 'pasian', limit: 5 },
    data: [],
    error: '',
    error_code: '',
    ...overrides,
  }
}

describe('ToolCallList', () => {
  it('names a completed call, its arguments and the result size', () => {
    const html = renderToStaticMarkup(
      <ToolCallList calls={[call({ data: [{ ref: 'kb/1' }] })]} />,
    )
    expect(html).toContain('rag_search')
    expect(html).toContain('completed')
    expect(html).toContain('arguments')
    // The result is labelled with what it holds, not just "result".
    expect(html).toContain('result — 1 row')
    expect(html).toContain('12 ms')
    expect(html).toContain('turn 1')
  })

  it('shows the failure class and the message of a failed call', () => {
    const html = renderToStaticMarkup(
      <ToolCallList
        calls={[
          call({
            ok: false,
            status: 'failed',
            data: undefined,
            error: 'no such verse',
            error_code: 'not_found',
          }),
        ]}
      />,
    )
    expect(html).toContain('failed')
    expect(html).toContain('not_found')
    expect(html).toContain('no such verse')
    // A failed call has no payload to disclose.
    expect(html).not.toContain('result —')
  })

  it('renders a declined call without pretending it ran', () => {
    const html = renderToStaticMarkup(
      <ToolCallList
        calls={[
          call({
            ok: false,
            status: 'declined',
            data: undefined,
            error: 'not executed: this run answers 3 tool calls per turn',
            error_code: 'budget_exceeded',
          }),
        ]}
      />,
    )
    expect(html).toContain('declined')
    expect(html).toContain('budget_exceeded')
    expect(html).toContain('not executed')
  })

  it('omits the result disclosure when a successful call carried no payload', () => {
    const html = renderToStaticMarkup(<ToolCallList calls={[call({ data: undefined })]} />)
    expect(html).toContain('arguments')
    expect(html).not.toContain('result —')
  })

  it('does not invent a turn number for a retrieval call that has none', () => {
    // The retrieval fallback never enters the agent loop; its trace rows carry
    // turn 0, which must read as "no turn", not as a first turn.
    const html = renderToStaticMarkup(<ToolCallList calls={[call({ turn: 0 })]} />)
    expect(html).toContain('12 ms')
    expect(html).not.toContain('turn 0')
  })

  it('labels an empty trace instead of rendering nothing', () => {
    const html = renderToStaticMarkup(<ToolCallList calls={[]} />)
    expect(html).toContain('No tool calls')
  })
})

describe('describeToolInput — one readable line per call', () => {
  it('names every argument in order', () => {
    expect(describeToolInput({ query: 'pasian', limit: 5 })).toBe(
      'query="pasian" · limit=5',
    )
  })

  it('counts collections instead of dumping them inline', () => {
    expect(describeToolInput({ source_filter: ['a', 'b'], nested: { x: 1 } })).toBe(
      'source_filter=[2 items] · nested={1 key}',
    )
  })

  it('says so when a tool was called with no arguments', () => {
    expect(describeToolInput({})).toBe('no arguments')
  })

  it('cuts a long string and leaves the exact value to the disclosure', () => {
    const line = describeToolInput({ text: 'x'.repeat(80) })
    expect(line.endsWith('…"')).toBe(true)
    expect(line.length).toBeLessThan(70)
  })
})

describe('describeToolResult — what the payload holds', () => {
  it('counts rows for a list (a search) and fields for a dict (a lookup)', () => {
    expect(describeToolResult([1, 2, 3])).toBe('3 rows')
    expect(describeToolResult([1])).toBe('1 row')
    expect(describeToolResult({ word: 'pasian', meaning: 'God' })).toBe('2 fields')
    expect(describeToolResult({})).toBe('empty object')
  })

  it('names the absent case rather than rendering "undefined"', () => {
    expect(describeToolResult(undefined)).toBe('no payload')
    expect(describeToolResult(null)).toBe('no payload')
  })
})
