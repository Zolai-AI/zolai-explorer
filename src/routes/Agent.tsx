import { useState, type FormEvent } from 'react'
import { Check, CircleDashed, KeyRound, ThumbsDown, ThumbsUp, Workflow, X } from 'lucide-react'
import { toast } from 'sonner'
import { RUN_TIMEOUT_MS, useAgentRun, useRunAgent, useSendFeedback } from '../features/agent/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { ProviderModelSelect } from '../components/ProviderModelSelect'
import { RawJson } from '../components/RawJson'
import { Skeleton } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { can, useRole } from '../lib/auth'
import { isApiError } from '../lib/api'
import { formatCount } from '../lib/format'
import type { AgentRun, ProviderSelection } from '../lib/schemas'

/** The orchestrator's four phases, in order (`zolai.agent.orchestrator`). */
const PHASE_ORDER = ['research', 'build', 'review', 'shipped'] as const

const PHASE_LABELS: Record<(typeof PHASE_ORDER)[number], string> = {
  research: 'Research',
  build: 'Build',
  review: 'Review',
  shipped: 'Shipped',
}

/**
 * Agent tab — goal in, run out.
 *
 * - `POST /agent/runs` is synchronous server-side (≤60s) and rate-limited to
 *   5/min/key: 403 = insufficient role, 429 = run budget, timeout = the 65s
 *   client budget — each gets its own honest message, never a silent retry.
 * - Phases render exactly what the server recorded; a phase the run never
 *   reached shows as pending, not failed.
 * - `score ≥ 1` feedback fires the server's **learn** phase (hypotheses
 *   candidates only) — surfaced as a note, not claimed as a DB write here.
 */
export function Agent() {
  const role = useRole()
  const allowed = can(role, 'member')
  const [goal, setGoal] = useState('')
  // Per-request target from the shared selector — travels in the run body as
  // `provider`/`model` and comes back as `requested_*` + the `provider · model`
  // the orchestrator actually used.
  const [selection, setSelection] = useState<ProviderSelection>({ provider: '', model: '' })
  const [runId, setRunId] = useState<number | null>(null)
  const run = useRunAgent()
  // The POST answer is the first row; the GET keeps it authoritative afterwards
  // (and polls while a run is still `running` server-side).
  const live = useAgentRun(runId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = goal.trim()
    if (!clean || run.isPending) return
    run.mutate({ goal: clean, selection }, {
      onSuccess: (created) => setRunId(created.id > 0 ? created.id : null),
      onError: (error: unknown) =>
        toast.error(failedTitle(error), { description: failedDetail(error) }),
    })
  }

  if (!allowed) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader />
        <Empty
          title="A key is required to run the agent"
          hint="Agent runs are strict server-side (401 without a key, 403 without a member+ scope). Paste a key in the top bar, then reload this tab."
          icon={<KeyRound className="size-5" aria-hidden />}
        >
          <p className="mt-1 text-[11px] text-muted-foreground">
            Public reads and the public assistant stay available without a key.
          </p>
        </Empty>
      </div>
    )
  }

  const data = live.data ?? run.data

  return (
    <div className="flex flex-col gap-5">
      <PageHeader />

      <Card
        title="Goal"
        subtitle={`POST /agent/runs · budget ${Math.round(RUN_TIMEOUT_MS / 1000)}s client / 60s server`}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <ProviderModelSelect
            value={selection}
            onChange={setSelection}
            idPrefix="agent-target"
            disabled={run.isPending}
          />
          <Textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Gather evidence for the word “pasian” across the Bible corpus…"
            rows={3}
            className="min-h-20 resize-y"
            aria-label="Agent goal"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Runs are capped at 5 per minute per key.
            </p>
            <Button type="submit" disabled={!goal.trim() || run.isPending} className="h-10">
              <Workflow aria-hidden />
              {run.isPending ? 'Running…' : 'Run agent'}
            </Button>
          </div>
        </form>
      </Card>

      {run.isPending ? (
        <Card title="Run" subtitle="in progress">
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
            <Skeleton className="h-32" />
            <span className="sr-only">The agent is running…</span>
          </div>
        </Card>
      ) : run.isError ? (
        <ErrorState
          error={run.error}
          onRetry={() => run.mutate({ goal: goal.trim(), selection })}
        />
      ) : !data ? (
        <Empty
          title="No run yet"
          hint="Describe a goal and start a run. The server researches, drafts, reviews the answer against ZVS 2018, then ships it."
        />
      ) : (
        <RunPanel run={data} />
      )}
    </div>
  )
}

function PageHeader() {
  return (
    <header>
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Workflow className="size-5 text-primary" aria-hidden />
        Agent
      </h1>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Goal-driven research loop: evidence gathering, draft, ZVS 2018 review, then ship. Every
        step below is what the server recorded — nothing is inferred.
      </p>
    </header>
  )
}

function RunPanel({ run }: { run: AgentRun }) {
  const feedback = useSendFeedback(run.id)
  // What the composer asked for, when an override was sent — kept apart from
  // `run.provider · run.model`, which is what actually ran.
  const requested = run.requested_provider || run.requested_model ? (
    <>
      {' · requested '}
      {run.requested_provider || 'server default'}
      {run.requested_model ? ` · ${run.requested_model}` : ''}
    </>
  ) : (
    ''
  )
  const finished = run.status === 'succeeded' || run.status === 'failed'
  const voted = run.feedback_score === 1 || run.feedback_score === -1

  const vote = (score: 1 | -1) => {
    feedback.mutate(score, {
      onSuccess: (result) => {
        const learned = result.learn?.learned === true
        toast.success(score === 1 ? 'Recorded a thumbs-up.' : 'Recorded a thumbs-down.', {
          description: learned
            ? 'The learn phase queued a hypothesis candidate (proposals only).'
            : 'Feedback stored on the run row.',
        })
      },
      onError: (error: unknown) =>
        toast.error('Feedback failed', {
          description: isApiError(error) ? error.message : String(error),
        }),
    })
  }

  return (
    <>
      <Card
        title="Run"
        subtitle={`#${formatCount(run.id)} · ${run.status}${run.mode ? ` · ${run.mode} mode` : ''}`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="max-lg:h-10"
              disabled={!finished || feedback.isPending || voted}
              onClick={() => vote(1)}
              aria-label="Thumbs up"
              aria-pressed={run.feedback_score === 1}
            >
              <ThumbsUp aria-hidden />
              {run.feedback_score === 1 ? 'Liked' : 'Up'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="max-lg:h-10"
              disabled={!finished || feedback.isPending || voted}
              onClick={() => vote(-1)}
              aria-label="Thumbs down"
              aria-pressed={run.feedback_score === -1}
            >
              <ThumbsDown aria-hidden />
              {run.feedback_score === -1 ? 'Disliked' : 'Down'}
            </Button>
          </div>
        }
      >
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Goal</p>
        <p className="mt-1 text-sm break-words">{run.goal}</p>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <div>
            <dt className="inline">Latency </dt>
            <dd className="inline font-mono">{formatCount(Math.round(run.latency_ms))} ms</dd>
          </div>
          <div>
            <dt className="inline">Turns </dt>
            <dd className="inline font-mono">{formatCount(run.turns)}</dd>
          </div>
          <div>
            <dt className="inline">Outcome </dt>
            <dd className="inline font-mono">{run.outcome || '—'}</dd>
          </div>
          <div>
            <dt className="inline">By </dt>
            <dd className="inline font-mono">{run.created_by || 'unknown'}</dd>
          </div>
        </dl>
        {run.error && (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 font-mono text-xs text-destructive">
            {run.error}
          </p>
        )}
      </Card>

      <Card title="Phases" subtitle="research → build → review → shipped (+ learn)">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {PHASE_ORDER.map((phase) => {
            // Server writes: ok | failed | skipped, or omits the key entirely
            // when the run never reached that phase (orchestrator).
            const state = run.phases[phase]?.status
            const Icon = state === 'ok' ? Check : state === 'failed' ? X : CircleDashed
            const label =
              state === undefined
                ? 'pending'
                : state === 'skipped'
                  ? 'skipped'
                  : state === 'ok' || state === 'failed'
                    ? ''
                    : state
            return (
              <li
                key={phase}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  state === 'ok'
                    ? 'border-primary/30 bg-primary/5'
                    : state === 'failed'
                      ? 'border-destructive/30 bg-destructive/10'
                      : state === 'skipped'
                        ? 'border-dashed bg-muted/20 text-muted-foreground'
                        : 'bg-muted/30 text-muted-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="font-medium">{PHASE_LABELS[phase]}</span>
                {label && (
                  <span
                    className={`ml-auto text-[10px] uppercase ${state === 'failed' ? 'text-destructive' : ''}`}
                  >
                    {label}
                  </span>
                )}
                {state === 'ok' && phase === 'research' && (
                  <span className="ml-auto font-mono">
                    {formatCount(run.phases[phase]?.evidence_count ?? 0)}
                  </span>
                )}
                {state === 'ok' && phase === 'build' && run.phases[phase]?.outcome && (
                  <span className="ml-auto font-mono">{run.phases[phase]?.outcome}</span>
                )}
              </li>
            )
          })}
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Learn runs on a thumbs-up (<span className="font-mono">score ≥ 1</span>) and only ever
          queues hypothesis candidates — it never writes canonical tables.
        </p>
      </Card>

      <Card
        title="Answer"
        subtitle={
          run.provider ? (
            <>
              {`${run.provider} · ${run.model}`}
              {requested}
            </>
          ) : (
            <>
              {'rule draft — no provider used'}
              {requested}
            </>
          )
        }
      >
        {run.answer ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{run.answer}</p>
        ) : (
          <Empty
            compact
            title="No answer recorded"
            hint="The run ended before an answer was stored — see the error on the run card."
          />
        )}
      </Card>

      <Card
        title="Tool calls"
        subtitle={`${run.tool_calls.length} call${run.tool_calls.length === 1 ? '' : 's'}`}
      >
        {run.tool_calls.length === 0 ? (
          <Empty compact title="No tool calls" hint="This run never invoked a tool." />
        ) : (
          <ul className="flex flex-col gap-2">
            {run.tool_calls.map((call, index) => (
              <li
                key={`${call.name}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="font-mono font-medium">{call.name}</span>
                <Badge variant={call.ok ? 'secondary' : 'destructive'}>
                  {call.status || (call.ok ? 'ok' : 'failed')}
                </Badge>
                <span className="ml-auto font-mono text-muted-foreground">
                  {formatCount(Math.round(call.latency_ms))} ms · turn {formatCount(call.turn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Evidence"
        subtitle={`${run.evidence.length} item${run.evidence.length === 1 ? '' : 's'} from research`}
      >
        {run.evidence.length === 0 ? (
          <Empty
            compact
            title="No evidence rows"
            hint="The research phase returned nothing citable for this goal."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {run.evidence.map((item, index) => {
              const source = typeof item.source === 'string' ? item.source : 'kb'
              const ref = typeof item.ref === 'string' ? item.ref : ''
              const text =
                typeof item.text === 'string'
                  ? item.text
                  : typeof item.en === 'string'
                    ? item.en
                    : ''
              return (
                <li key={`${source}-${ref}-${index}`} className="rounded-lg border bg-muted/40 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge variant="secondary">{source}</Badge>
                    {ref && <span className="font-mono text-muted-foreground">{ref}</span>}
                  </div>
                  {text && <p className="text-xs leading-relaxed break-words">{text}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <RawJson data={run} label="raw run" />
    </>
  )
}

function failedTitle(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 403) return 'Not allowed for this key'
    if (error.status === 429) return 'Run budget reached'
    if (error.kind === 'timeout') return 'The run exceeded the time budget'
    if (error.status === 401) return 'API key required'
  }
  return 'Run failed'
}

function failedDetail(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 403) return 'This key lacks a member+ role on the server.'
    if (error.status === 429)
      return 'Five runs per minute per key — wait a moment and try again.'
    if (error.kind === 'timeout')
      return `No answer within ${Math.round(RUN_TIMEOUT_MS / 1000)}s; the server budget is 60s.`
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
