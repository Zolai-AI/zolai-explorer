import { Wrench } from 'lucide-react'
import { Empty } from './Empty'
import { RawJson } from './RawJson'
import { Badge } from './ui/badge'
import { formatCount } from '../lib/format'
import type { ToolCall } from '../lib/schemas'

/**
 * One tool call, rendered the way a function call actually reads: **what was
 * called**, **with which arguments**, and **what came back** (or why it
 * failed). The assistant and the agent run inspector both use this list, so a
 * trace cannot say one thing on the chat page and another on the run page.
 *
 * The collapsed disclosures keep the reading surface clean: the row states the
 * arguments inline and the result in one phrase ("9 rows", "3 fields"), and
 * the full payload stays one click away via the shared `RawJson` disclosure.
 */
export function ToolCallList({ calls }: { calls: ToolCall[] }) {
  if (calls.length === 0) {
    return (
      <Empty
        compact
        title="No tool calls"
        hint="The model answered directly, or the run fell back before calling a tool."
      />
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {calls.map((call, index) => (
        <ToolCallRow key={`${call.name}-${call.turn}-${index}`} call={call} />
      ))}
    </ul>
  )
}

function ToolCallRow({ call }: { call: ToolCall }) {
  const status = call.status || (call.ok ? 'ok' : 'failed')
  const hasResult = call.ok && call.data !== undefined
  return (
    <li className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Wrench className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-mono font-medium [overflow-wrap:anywhere]">{call.name}</span>
        <Badge variant={call.ok ? 'secondary' : 'destructive'}>{status}</Badge>
        {call.error_code !== '' && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {call.error_code}
          </Badge>
        )}
        <span className="ml-auto font-mono text-muted-foreground">
          {formatCount(Math.round(call.latency_ms))} ms
          {/* The retrieval fallback has no agent turns; `turn 0` would read as
              a turn number rather than "this path has none". */}
          {call.turn > 0 ? ` · turn ${formatCount(call.turn)}` : ''}
        </span>
      </div>

      <p className="mt-1 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
        {describeToolInput(call.input)}
      </p>

      {call.error !== '' && (
        <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{call.error}</p>
      )}

      <div className="mt-1.5 flex flex-col gap-1.5">
        <RawJson data={call.input} label="arguments" maxHeight="12rem" />
        {hasResult && (
          <RawJson
            data={call.data}
            label={`result — ${describeToolResult(call.data)}`}
            maxHeight="12rem"
          />
        )}
      </div>
    </li>
  )
}

/**
 * One line of the arguments the tool received: `query="pasian" · limit=5`.
 * Long strings are cut with an ellipsis (the exact value is in the disclosure),
 * and collections are counted, never stringified inline.
 */
export function describeToolInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return 'no arguments'
  return entries.map(([key, value]) => `${key}=${compactValue(value)}`).join(' · ')
}

function compactValue(value: unknown): string {
  if (typeof value === 'string') {
    const text = value.length > 48 ? `${value.slice(0, 48)}…` : value
    return JSON.stringify(text)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return `[${value.length} item${value.length === 1 ? '' : 's'}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).length
    return `{${keys} key${keys === 1 ? '' : 's'}}`
  }
  return '—'
}

/** `9 rows` for a search, `3 fields` for a lookup, `no payload` when absent. */
export function describeToolResult(data: unknown): string {
  if (Array.isArray(data)) return `${data.length} row${data.length === 1 ? '' : 's'}`
  if (data !== null && typeof data === 'object') {
    const keys = Object.keys(data).length
    if (keys === 0) return 'empty object'
    return `${keys} field${keys === 1 ? '' : 's'}`
  }
  if (data === null || data === undefined) return 'no payload'
  return String(data)
}
