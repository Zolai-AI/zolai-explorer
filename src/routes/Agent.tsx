import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, CircleDashed, ThumbsDown, ThumbsUp, Workflow, X } from 'lucide-react'
import { toast } from 'sonner'
import { RUN_TIMEOUT_MS, useAgentRun, useRunAgent, useSendFeedback } from '../features/agent/api'
import { Card } from '../components/Card'
import { CopyValue } from '../components/CopyValue'
import { Empty } from '../components/Empty'
import { describeError, ErrorState, failureDetail } from '../components/ErrorState'
import { MetaList } from '../components/MetaList'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { ProviderModelSelect } from '../components/ProviderModelSelect'
import { RawJson } from '../components/RawJson'
import { Skeleton } from '../components/Skeleton'
import { ToolCallList } from '../components/ToolCallList'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { failedDetail, failedTitle } from '../lib/agentErrors'
import { documentedPath } from '../lib/endpoints'
import { isApiError } from '../lib/api'
import { formatCount } from '../lib/format'
import { AGENT_RUN_PARAM, agentRunFromSearch, agentSearch, pathOf } from '../lib/routes'
import type { AgentRun, ProviderSelection } from '../lib/schemas'

/** The orchestrator's four phases, in order (`zolai.agent.orchestrator`). */
const PHASE_ORDER = ['research', 'build', 'review', 'shipped'] as const

const PHASE_LABELS: Record<(typeof PHASE_ORDER)[number], string> = {
  research: 'Research',
  build: 'Build',
  review: 'Review',
  shipped: 'Shipped',
}

/** A status chip: the Badge variant owns the colour, the label owns the meaning. */
type PhaseChip = { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }

/**
 * Server status → chip. `ok` / `failed` / `skipped` are what the orchestrator
 * writes; an absent key means the run never reached the phase, which is
 * **pending**, not failed. Anything unexpected is shown verbatim rather than
 * re-labelled into one of the three known states.
 */
function phaseChip(status: string | undefined): PhaseChip {
  if (status === undefined) return { variant: 'outline', label: 'pending' }
  if (status === 'ok') return { variant: 'default', label: 'ok' }
  if (status === 'failed') return { variant: 'destructive', label: 'failed' }
  if (status === 'skipped') return { variant: 'secondary', label: 'skipped' }
  return { variant: 'outline', label: status }
}

/**
 * A labelled phase measurement. Every number in a phase chip carries its name —
 * a bare digit reads as decoration, and neither a screen reader nor a second
 * glance can say what it counted.
 */
function PhaseMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 font-mono">
      <span className="text-xs uppercase tracking-wider">{label}</span>
      <span>{value}</span>
    </span>
  )
}

/**
 * Toast copy for a failed call.
 *
 * The agent-specific conditions (the 524 edge timeout, the 429 run budget, a
 * 403 scope, the client run budget) already have their own tested wording in
 * `lib/agentErrors`. What must not reach a toast is a *transport* string —
 * `String(error)` or an ApiError whose message is browser internals ("Failed to
 * fetch") — so those get the same human naming the panel surface (`ErrorState`)
 * applies. `defaultTitle` names the action that failed when nothing more
 * specific is known.
 */
function failureToast(error: unknown, defaultTitle: string): { title: string; description: string } {
  if (!isApiError(error)) {
    // Never echo a raw non-API error string into a toast — the panel owns that
    // detail; the toast only says the request did not complete.
    return { title: 'Something went wrong', description: 'The request did not complete.' }
  }
  // Transport kinds share the app's single classifier (ErrorState), so the
  // toast and the panel name the same failure the same way.
  const d = describeError(error)
  if (error.kind === 'network' || error.kind === 'aborted' || error.kind === 'parse') {
    return { title: d.title, description: failureDetail(error) }
  }
  const title = failedTitle(error)
  return {
    title: title === 'Run failed' ? defaultTitle : title,
    description: failedDetail(error, Math.round(RUN_TIMEOUT_MS / 1000)),
  }
}

/**
 * Agent tab — goal in, run out.
 *
 * - `POST /agent/runs` is synchronous server-side (≤60s) and rate-limited to
 *   5/min/credential: 403 = insufficient role, 429 = run budget, timeout = the 65s
 *   client budget — each gets its own honest message, never a silent retry.
 * - The page is reached **only** with a member+ role: `/agent` is
 *   `minRole: 'member'` in the route registry and `RequireRole` renders the
 *   sign-in prompt *before* this component runs, so there is no sign-in branch
 *   here — the route-level wall is where that state lives (see `App.tsx`).
 * - Phases render exactly what the server recorded; a phase the run never
 *   reached shows as pending, not failed.
 * - The run on screen is **the URL's** (`?run=412`, pushed when you start one,
 *   read through `agentRunFromSearch`), so a finished run is linkable and
 *   survives a reload. The goal stays out of the address: it is an input, not a
 *   view, and a pasted goal invites running it again by accident.
 * - `score ≥ 1` feedback fires the server's **learn** phase (hypotheses
 *   candidates only) — surfaced as a note, not claimed as a DB write here.
 */
export function Agent() {
  const [goal, setGoal] = useState('')
  // Per-request target from the shared selector — travels in the run body as
  // `provider`/`model` and comes back as `requested_*` + the `provider · model`
  // the orchestrator actually used.
  const [selection, setSelection] = useState<ProviderSelection>({ provider: '', model: '' })
  // The run this view shows is **the URL's**, not a `useState` copy: an id in
  // component state cannot be pasted to a colleague and dies on reload, which is
  // how run #412 used to be unshareable.
  const [searchParams, setSearchParams] = useSearchParams()
  const runId = agentRunFromSearch(searchParams)
  const run = useRunAgent()
  // The POST answer is the first row; the GET keeps it authoritative afterwards
  // (and polls while a run is still `running` server-side).
  const live = useAgentRun(runId)

  const showRun = (id: number | null) => {
    // A new run is a record the operator asked for, not a view change, so this
    // writes with the default **push** — `Back` returns to the run you were just
    // looking at. (`/review` and `/word` pass `replace: true`, because there the
    // URL is a view and a chip click should not fill the history.)
    const params = new URLSearchParams(searchParams)
    if (id === null || id <= 0) params.delete(AGENT_RUN_PARAM)
    else params.set(AGENT_RUN_PARAM, String(id))
    setSearchParams(params)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = goal.trim()
    if (!clean || run.isPending) return
    run.mutate({ goal: clean, selection }, {
      onSuccess: (created) => showRun(created.id > 0 ? created.id : null),
      onError: (error: unknown) => {
        const failure = failureToast(error, 'Run failed')
        toast.error(failure.title, { description: failure.description })
      },
    })
  }

  // Only the POST answer for *this* run may stand in for the live row: a stale
  // `run.data` from the last submission must not shadow a pasted `?run=` id.
  const data = live.data ?? (run.data && run.data.id === runId ? run.data : undefined)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Agent"
        icon={<Workflow className="size-5" aria-hidden />}
        description="Goal-driven research loop: evidence gathering, draft, ZVS 2018 review, then ship. Every step below is what the server recorded — nothing is inferred."
      />

      <Card
        title="Goal"
        subtitle={`POST ${documentedPath('agent.run.create')} · budget ${Math.round(RUN_TIMEOUT_MS / 1000)}s client / 60s server`}
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
              Runs are capped at 5 per minute per credential.
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
      ) : runId !== null && live.isPending ? (
        <Card title="Run" subtitle={`#${formatCount(runId)} · loading`}>
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10" />
            <Skeleton className="h-32" />
            <span className="sr-only">Loading the run this link asks for…</span>
          </div>
        </Card>
      ) : runId !== null && live.isError ? (
        <>
          <ErrorState error={live.error} onRetry={() => void live.refetch()} />
          <p className="text-xs text-muted-foreground">
            This page asked for `GET {documentedPath('agent.run.read', { run_id: runId })}` — the id came from
            the link, not from a run started in this tab.
          </p>
        </>
      ) : !data ? (
        <Empty
          title="No run yet"
          hint={`Nothing has been sent to POST ${documentedPath('agent.run.create')} from this tab. Describe a goal above and the server researches, drafts, reviews the answer against ZVS 2018, then ships it.`}
        />
      ) : (
        <RunPanel run={data} />
      )}
    </div>
  )
}

/**
 * A run's own address: `/agent?run=412`, absolute when a document exists to
 * resolve it against. This is what makes candidate #11 real — the id used to
 * live in `useState`, so a finished run could be described but not linked.
 */
export function runLink(runId: number): string {
  const path = `${pathOf('agent')}?${agentSearch(runId)}`
  const origin = globalThis.window?.location?.origin
  return origin ? `${origin}${path}` : path
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
      onError: (error: unknown) => {
        const failure = failureToast(error, 'Feedback failed')
        toast.error(failure.title, { description: failure.description })
      },
    })
  }

  return (
    <>
      <Card
        title="Run"
        subtitle={`#${formatCount(run.id)} · ${run.status}${run.mode ? ` · ${run.mode} mode` : ''}`}
        actions={
          <div className="flex items-center gap-1.5">
            <CopyValue value={runLink(run.id)} label="this run's link" />
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
        <MetaList
          className="mt-3"
          items={[
            { label: 'Latency', value: `${formatCount(Math.round(run.latency_ms))} ms` },
            { label: 'Turns', value: formatCount(run.turns) },
            // A field the payload did not carry renders `—` — never a guess, never a zero.
            { label: 'Outcome', value: run.outcome === '' ? undefined : run.outcome },
            { label: 'Started by', value: run.created_by === '' ? undefined : run.created_by },
          ]}
        />
        {run.error && (
          <Notice
            className="mt-2"
            tone="danger"
            title="Recorded run error"
            icon={<X className="size-4" aria-hidden />}
          >
            <span className="font-mono text-xs break-words">
              {/* Exactly what the server stored — not reworded, not a client guess. */}
              {run.error}
            </span>
          </Notice>
        )}
      </Card>

      <Card title="Phases" subtitle="research → build → review → shipped (+ learn)">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {PHASE_ORDER.map((phase) => {
            // Server writes: ok | failed | skipped, or omits the key entirely
            // when the run never reached that phase (orchestrator).
            const recorded = run.phases[phase]
            const status = recorded?.status
            const chip = phaseChip(status)
            const Icon = status === 'ok' ? Check : status === 'failed' ? X : CircleDashed
            const reached = status === 'ok' || status === 'failed'
            return (
              <li
                key={phase}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  reached ? '' : 'border-dashed text-muted-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="font-medium">{PHASE_LABELS[phase]}</span>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  {status === 'ok' && phase === 'research' && (
                    // `formatCount` renders `—` for a nullish count; a phase
                    // that reported nothing must not read as "0 evidence".
                    <PhaseMetric label="evidence" value={formatCount(recorded?.evidence_count)} />
                  )}
                  {status === 'ok' && phase === 'build' && recorded?.outcome && (
                    <PhaseMetric label="outcome" value={recorded.outcome} />
                  )}
                  <Badge variant={chip.variant}>{chip.label}</Badge>
                </span>
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
              {/* The model travels only when the payload names it — `—`, never a blank. */}
              {`${run.provider} · ${run.model || '—'}`}
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
        <ToolCallList calls={run.tool_calls} />
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

