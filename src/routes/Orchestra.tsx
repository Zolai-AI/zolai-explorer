import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Bot,
  Cable,
  Info,
  Network,
  Play,
  Save,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  LEARNING_TASKS,
  RESULT_ROWS,
  RESULT_SCALARS,
  enabledAgentCount,
  learningTask,
  roleLabel,
  useBindAgent,
  useLearningAgents,
  useLearningAssistants,
  useLearningBindings,
  useLearningOverview,
  useLearningSkills,
  useRunLearningTask,
  useSetAgentEnabled,
  useUnbindAgent,
  useUpdateLearningAgent,
  type LearningFieldId,
  type LearningTaskId,
} from '../features/learning/api'
import { Card } from '../components/Card'
import { DataTable, type Column } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { ErrorPanel } from '../components/ErrorState'
import { StatTile } from '../components/StatTile'
import { RawJson } from '../components/RawJson'
import { Skeleton } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Field, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { isApiError } from '../lib/api'
import { can, useRole } from '../lib/auth'
import { formatCount, formatScore } from '../lib/format'
import type { HideBelow } from '../lib/datatable'
import type { LearningAgent, LearningAssistant, LearningBinding, LearningRun } from '../lib/schemas'

/**
 * Orchestra — the multi-agent learning system, end to end.
 *
 * What the page is allowed to claim, and how:
 * - **Reads are public.** `GET /learning/overview`, `/learning/agents` and
 *   `/learning/skills` carry no scope server-side, so an anonymous visitor sees
 *   the whole roster. The route itself is `minRole: 'anonymous'` for that
 *   reason (see `src/lib/routes.ts`).
 * - **Writes are admin-only.** Enable/disable, threshold edits and bind/unbind
 *   are `require_role("admin", strict=True)` on the server, so the controls are
 *   rendered only for a role the *server* reported — a member sees a read-only
 *   roster rather than buttons that would 401.
 * - **`limit_clamped` is stated, never hidden.** The server caps an anonymous
 *   caller at 50 and says so in the response; the run panel reports both the
 *   requested and the applied budget instead of implying it produced the page it
 *   asked for.
 * - **Assignments may not exist.** `/learning/assistants` and `/learning/bindings`
 *   are absent from this deployment (404), so that panel says so in words
 *   instead of rendering an empty list that reads as "no assistants exist".
 */
export function Orchestra() {
  const role = useRole()
  const isAdmin = can(role, 'admin')

  const overview = useLearningOverview()
  const agents = useLearningAgents()
  const skills = useLearningSkills()

  return (
    <div className="flex flex-col gap-5">
      <OrchestraHeader isAdmin={isAdmin} />

      <OverviewSection overview={overview} />

      <TeamSection agents={agents} isAdmin={isAdmin} />

      <SkillsSection skills={skills} />

      <RunSection />

      <AssignmentsSection isAdmin={isAdmin} />
    </div>
  )
}

function OrchestraHeader({ isAdmin }: { isAdmin: boolean }) {
  return (
    <header>
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Network className="size-5 text-primary" aria-hidden />
        Orchestra
      </h1>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        The learning agent team: who is registered, what each agent is tuned to, a live run of any
        orchestrator task, and which assistants those agents are assigned to. Reads are public;
        {isAdmin
          ? ' your admin session can enable agents, retune thresholds and change assignments.'
          : ' changing the team needs an admin key, so the roster below is read-only.'}
      </p>
    </header>
  )
}

/* ------------------------------------------------------------- 1. overview */

function OverviewSection({ overview }: { overview: ReturnType<typeof useLearningOverview> }) {
  const data = overview.data

  if (overview.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
        <span className="sr-only">Loading the registry overview…</span>
      </div>
    )
  }

  if (overview.isError) {
    return <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} />
  }

  const roles = Object.entries(data?.roles ?? {})

  return (
    <div className="flex flex-col gap-3">
      {/* Two columns on a phone, three at `sm`, five from `lg` — the base layout
          is the small screen and every step up is additive. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Agents" value={data?.agents_total ?? 0} hint="registered in the registry" />
        <StatTile
          label="Enabled"
          value={data?.agents_enabled ?? 0}
          hint="taking part in runs"
          accent
        />
        <StatTile label="Disabled" value={data?.agents_disabled ?? 0} hint="kept but idle" />
        <StatTile label="Skills" value={data?.skills_total ?? 0} hint="in the catalog" />
        <StatTile label="Roles" value={roles.length} hint="distinct agent roles" />
      </div>

      {roles.length > 0 && (
        <Card title="Roles" subtitle="GET /learning/overview · agents per role" tone="muted">
          <ul className="flex flex-wrap gap-2">
            {roles.map(([role, count]) => (
              <li key={role}>
                <Badge variant="outline" className="font-normal">
                  {roleLabel(role)}
                  <span className="ml-1.5 font-mono tabular-nums">{formatCount(count)}</span>
                </Badge>
              </li>
            ))}
          </ul>
          {(data?.seeded_defaults.length ?? 0) > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Seeded on first use:{' '}
              <span className="font-mono">{data?.seeded_defaults.join(', ')}</span>
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- 2. team */

function TeamSection({
  agents,
  isAdmin,
}: {
  agents: ReturnType<typeof useLearningAgents>
  isAdmin: boolean
}) {
  if (agents.isPending) {
    return (
      <Card title="Team" subtitle="GET /learning/agents">
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <span className="sr-only">Loading agents…</span>
        </div>
      </Card>
    )
  }

  if (agents.isError) {
    return (
      <Card title="Team" subtitle="GET /learning/agents">
        <ErrorPanel error={agents.error} onRetry={() => void agents.refetch()} />
      </Card>
    )
  }

  const roster = agents.data?.agents ?? []

  return (
    <Card
      title="Team"
      subtitle={`GET /learning/agents · ${formatCount(roster.length)} agent${roster.length === 1 ? '' : 's'}`}
      bodyClassName="flex flex-col gap-3"
    >
      {roster.length === 0 ? (
        <Empty
          title="No agents in the registry"
          hint="The server seeds four default agents on first use. An empty roster here means the registry could not be read or really is empty — not that the panel failed."
        />
      ) : (
        <>
          {/* One column on a phone; two at `md`, three from `xl`. A card grid
              rather than a table, so an agent is never a clipped row at 375px. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {roster.map((agent) => (
              <AgentCard key={agent.agent_id} agent={agent} isAdmin={isAdmin} />
            ))}
          </div>
          {!isAdmin && <ReadOnlyNote />}
        </>
      )}
    </Card>
  )
}

function AgentCard({ agent, isAdmin }: { agent: LearningAgent; isAdmin: boolean }) {
  const toggle = useSetAgentEnabled()
  const update = useUpdateLearningAgent()
  const threshold = agent.config.confidence_threshold
  const [draft, setDraft] = useState(
    typeof threshold === 'number' ? threshold.toFixed(2) : '',
  )

  // The server is the source of truth: follow a refetched value we do not own.
  useEffect(() => {
    setDraft(typeof threshold === 'number' ? threshold.toFixed(2) : '')
  }, [threshold])

  const parsed = Number.parseFloat(draft)
  const dirty =
    draft.trim() !== '' && Number.isFinite(parsed) && Math.abs(parsed - (threshold ?? 0)) > 1e-9
  const busy = toggle.isPending || update.isPending

  const setEnabled = (enabled: boolean) => {
    if (enabled === agent.enabled) return
    toggle.mutate(
      { agentId: agent.agent_id, enabled },
      {
        onSuccess: () => toast.success(`${agent.name} ${enabled ? 'enabled' : 'disabled'}.`),
        onError: (error: unknown) =>
          toast.error(`Could not ${enabled ? 'enable' : 'disable'} ${agent.name}`, {
            description: isApiError(error) ? error.message : String(error),
          }),
      },
    )
  }

  const saveThreshold = () => {
    if (!dirty || !Number.isFinite(parsed)) return
    update.mutate(
      { agentId: agent.agent_id, update: { confidence_threshold: parsed } },
      {
        onSuccess: () =>
          toast.success(`${agent.name} threshold set to ${formatScore(parsed)}.`),
        onError: (error: unknown) =>
          toast.error('Could not change the threshold', {
            description: isApiError(error) ? error.message : String(error),
          }),
      },
    )
  }

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="min-w-0 truncate text-sm font-semibold">{agent.name}</h3>
        <Badge variant="outline">{roleLabel(agent.role)}</Badge>
        <Badge variant={agent.enabled ? 'default' : 'secondary'}>
          {agent.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      <p className="font-mono text-[10px] break-all text-muted-foreground">{agent.agent_id}</p>

      <div className="flex flex-wrap gap-1.5">
        {agent.skills.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">No skills assigned</span>
        ) : (
          agent.skills.map((skill) => (
            <Badge key={skill} variant="secondary" className="font-normal">
              {roleLabel(skill)}
            </Badge>
          ))
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <p className="text-[11px] text-muted-foreground">
          Confidence threshold{' '}
          <span className="font-mono">
            {typeof threshold === 'number' ? formatScore(threshold) : '—'}
          </span>
          {agent.config.bible_priority === true && (
            <Badge variant="secondary" className="ml-2 font-normal">
              Bible priority
            </Badge>
          )}
        </p>

        {isAdmin ? (
          <>
            <div className="flex min-h-10 items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {agent.enabled ? 'Takes part in runs' : 'Idle'}
              </span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={agent.enabled}
                  onCheckedChange={setEnabled}
                  disabled={busy}
                  aria-label={`Enable ${agent.name}`}
                />
                <span className="text-xs">{agent.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            {/* `w-full` base, a fixed track from `sm`: the number field is
                always full width on a phone rather than a 90px sliver. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor={`threshold-${agent.agent_id}`}>Threshold (0–1)</FieldLabel>
                <Input
                  id={`threshold-${agent.agent_id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveThreshold()
                    }
                  }}
                  disabled={busy}
                  placeholder="not set"
                  className="mt-1 h-10 w-full font-mono sm:w-32"
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                onClick={saveThreshold}
                disabled={!dirty || busy}
                className="h-10 w-full sm:w-auto"
              >
                <Save aria-hidden />
                Save
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </article>
  )
}

function ReadOnlyNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Read-only view: enabling an agent, retuning a threshold, binding and unbinding are
        <span className="font-mono"> admin</span>-only routes server-side. Sign in with an admin key to
        change the team.
      </span>
    </p>
  )
}

/* --------------------------------------------------------------- 3. skills */

function SkillsSection({ skills }: { skills: ReturnType<typeof useLearningSkills> }) {
  if (skills.isPending) {
    return (
      <Card title="Skill catalog" subtitle="GET /learning/skills">
        <Skeleton className="h-20" />
      </Card>
    )
  }
  if (skills.isError) {
    return (
      <Card title="Skill catalog" subtitle="GET /learning/skills">
        <ErrorPanel error={skills.error} onRetry={() => void skills.refetch()} />
      </Card>
    )
  }

  const catalog = skills.data?.skills ?? []

  return (
    <Card
      title="Skill catalog"
      subtitle={`GET /learning/skills · ${formatCount(catalog.length)} skill${catalog.length === 1 ? '' : 's'}`}
    >
      {catalog.length === 0 ? (
        <Empty
          compact
          title="No skills published"
          hint="The registry returned an empty skill catalog — no agent badge on this page has anything to resolve to."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((skill) => (
            <li key={skill.skill_id} className="min-w-0 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate text-xs font-medium">{skill.name}</span>
                {skill.category && <Badge variant="outline">{roleLabel(skill.category)}</Badge>}
                {!skill.enabled && <Badge variant="secondary">Disabled</Badge>}
              </div>
              {skill.description && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {skill.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ 4. run */

const FIELD_LABELS: Record<LearningFieldId, string> = {
  source_lang: 'Source language',
  target_lang: 'Target language',
  pattern_type: 'Pattern type',
  min_frequency: 'Minimum frequency',
}

/** The server's documented anonymous ceiling — stated, not silently applied. */
const PUBLIC_LIMIT = 50

function RunSection() {
  const run = useRunLearningTask()
  const [task, setTask] = useState<LearningTaskId>('translate')
  const [text, setText] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zo')
  const [patternType, setPatternType] = useState('sov')
  const [minFrequency, setMinFrequency] = useState('1')
  const [limit, setLimit] = useState('10')

  const spec = learningTask(task)
  const textRequired = spec.text && text.trim() === ''
  const requested = Number.parseInt(limit, 10)
  const wouldClamp = Number.isFinite(requested) && requested > PUBLIC_LIMIT

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (run.isPending || textRequired) return
    run.mutate(
      {
        task,
        source_text: text,
        source_lang: sourceLang,
        target_lang: targetLang,
        pattern_type: patternType,
        min_frequency: Number.parseInt(minFrequency, 10) || 1,
        limit: Number.isFinite(requested) ? requested : 10,
      },
      {
        onError: (error: unknown) =>
          toast.error('The learning task failed', {
            description: isApiError(error) ? error.message : String(error),
          }),
      },
    )
  }

  return (
    <>
      <Card
        title="Run a task"
        subtitle="POST /learning/run · public · anonymous callers are clamped to limit 50"
      >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="orchestra-task">Task</FieldLabel>
            <Select value={task} onValueChange={(value) => setTask(value as LearningTaskId)}>
              <SelectTrigger id="orchestra-task" className="mt-1 h-10 w-full">
                <SelectValue placeholder="Choose a task…" />
              </SelectTrigger>
              <SelectContent>
                {LEARNING_TASKS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="orchestra-limit">Limit</FieldLabel>
            <Input
              id="orchestra-limit"
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="mt-1 h-10 w-full font-mono"
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">{spec.hint}</p>

        {spec.text && (
          <Field>
            <FieldLabel htmlFor="orchestra-source">Source text</FieldLabel>
            <Textarea
              id="orchestra-source"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Jisu chang vaan man chang."
              rows={3}
              className="min-h-20 resize-y"
            />
          </Field>
        )}

        {spec.fields.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {spec.fields.map((field) => (
              <Field key={field}>
                <FieldLabel htmlFor={`orchestra-${field}`}>{FIELD_LABELS[field]}</FieldLabel>
                <Input
                  id={`orchestra-${field}`}
                  type={field === 'min_frequency' ? 'number' : 'text'}
                  inputMode={field === 'min_frequency' ? 'numeric' : undefined}
                  min={field === 'min_frequency' ? 1 : undefined}
                  value={
                    field === 'source_lang'
                      ? sourceLang
                      : field === 'target_lang'
                        ? targetLang
                        : field === 'pattern_type'
                          ? patternType
                          : minFrequency
                  }
                  onChange={(event) => {
                    const next = event.target.value
                    if (field === 'source_lang') setSourceLang(next)
                    else if (field === 'target_lang') setTargetLang(next)
                    else if (field === 'pattern_type') setPatternType(next)
                    else setMinFrequency(next)
                  }}
                  className="mt-1 h-10 w-full font-mono"
                />
              </Field>
            ))}
          </div>
        )}

        {wouldClamp && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Anonymous callers are clamped to <span className="font-mono">limit {PUBLIC_LIMIT}</span>{' '}
              by the server. It will answer with what it actually ran.
            </span>
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Only the fields this task reads are sent — an empty box is never sent as{' '}
            <span className="font-mono">&quot;&quot;</span>.
          </p>
          <Button type="submit" disabled={run.isPending || textRequired} className="h-10 w-full sm:w-auto">
            <Play aria-hidden />
            {run.isPending ? 'Running…' : 'Run task'}
          </Button>
        </div>
      </form>
      </Card>

      {run.isPending && (
        <Card title="Result" subtitle="in progress">
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-16" />
            <span className="sr-only">The learning task is running…</span>
          </div>
        </Card>
      )}

      {run.isError && <ErrorPanel error={run.error} />}

      {run.data && <RunResult result={run.data} />}
    </>
  )
}

function RunResult({ result }: { result: LearningRun }) {
  const scalars = RESULT_SCALARS[result.task as LearningTaskId] ?? []
  const rows = RESULT_ROWS[result.task as LearningTaskId]
  const payload = result.result

  return (
    <Card
      title="Result"
      subtitle={`${result.task} · limit ${formatCount(result.limit_applied)} applied`}
      tone={result.limit_clamped ? 'muted' : 'default'}
    >
      {result.limit_clamped && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            The server clamped the budget for your role — this result is what
            <span className="font-mono"> limit {formatCount(result.limit_applied)}</span> produced,
            not the page the request asked for.
          </span>
        </p>
      )}

      {Object.keys(payload).length === 0 ? (
        <Empty
          compact
          title="The task returned no fields"
          hint="The server answered with an empty result body — see the raw payload below."
        />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scalars
              .filter((key) => key in payload)
              .map((key) => (
                <div key={key} className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    {key.replace(/_/g, ' ')}
                  </dt>
                  <dd className="mt-0.5 text-sm break-words">
                    {renderScalar(payload[key])}
                  </dd>
                </div>
              ))}
          </dl>

          {rows && Array.isArray(payload[rows.field]) && (
            <ResultRows rows={rows} data={payload[rows.field] as Record<string, unknown>[]} />
          )}

          <RawJson data={result} label="raw learning run" />
        </>
      )}
    </Card>
  )
}

function renderScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') return formatCount(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function ResultRows({
  rows,
  data,
}: {
  rows: NonNullable<(typeof RESULT_ROWS)[LearningTaskId]>
  data: Record<string, unknown>[]
}) {
  const columns = useMemo<Column<Record<string, unknown>>[]>(() => {
    const priority: HideBelow[] = ['md', 'lg', 'xl']
    return rows.columns.map((column, index) => ({
      key: column,
      header: roleLabel(column),
      // Columns past the first two drop out below `md` so the table stays
      // usable at 375px; the first column is never hidden, because it is the
      // only place the row's identity appears.
      hideBelow: index < 2 ? undefined : priority[Math.min(index - 2, priority.length - 1)],
      sortValue: (row) => (typeof row[column] === 'number' ? row[column] : String(row[column] ?? '')),
      cell: (row) => (
        <span className="block max-w-[22rem] truncate" title={String(row[column] ?? '')}>
          {renderScalar(row[column])}
        </span>
      ),
    }))
  }, [rows])

  if (data.length === 0) {
    return (
      <Empty
        compact
        title={`No ${rows.field} in this result`}
        hint="The task ran and found nothing under this budget — a smaller or larger limit changes that, and the server reports what it applied."
      />
    )
  }

  return (
    <div className="mt-3">
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(row, index) => `${String(row[rows.columns[0]] ?? rows.field)}-${index}`}
        caption={`${formatCount(data.length)} ${rows.field} returned by the task`}
      />
    </div>
  )
}

/* ---------------------------------------------------------- 5. assignments */

function AssignmentsSection({ isAdmin }: { isAdmin: boolean }) {
  const assistants = useLearningAssistants()
  const bindings = useLearningBindings()

  // The two routes are absent from some deployments: a 404 here is a **missing
  // route**, not "this deployment has no assistants", and the two must not be
  // rendered with the same words.
  const missing = isMissingAssignments(assistants.error, bindings.error)
  if (missing) {
    return (
      <Card title="Assignments" subtitle="GET /learning/assistants · GET /learning/bindings">
        <Empty
          title="Assistant assignments are not available on this deployment"
          hint="Both /learning/assistants and /learning/bindings answer 404 here — they exist in the zolai-core router but are not registered on this server, so no assistant, binding, or assignment control is shown. The agent roster and the task runner above are unaffected."
          icon={<Cable className="size-5" aria-hidden />}
        />
      </Card>
    )
  }

  if (assistants.isPending || bindings.isPending) {
    return (
      <Card title="Assignments" subtitle="GET /learning/assistants">
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <span className="sr-only">Loading assistant assignments…</span>
        </div>
      </Card>
    )
  }

  if (assistants.isError || bindings.isError) {
    return (
      <Card title="Assignments" subtitle="GET /learning/assistants">
        <ErrorPanel
          error={assistants.error ?? bindings.error}
          onRetry={() => {
            void assistants.refetch()
            void bindings.refetch()
          }}
        />
      </Card>
    )
  }

  const rows = assistants.data?.assistants ?? []
  const allBindings = bindings.data?.bindings ?? []

  return (
    <Card
      title="Assignments"
      subtitle={`GET /learning/assistants · ${formatCount(rows.length)} assistant${rows.length === 1 ? '' : 's'} · ${formatCount(allBindings.length)} binding${allBindings.length === 1 ? '' : 's'}`}
      bodyClassName="flex flex-col gap-4"
    >
      {rows.length === 0 ? (
        <Empty
          title="No assistant surfaces yet"
          hint="An assistant appears here once an agent is bound to it. Nothing is bound on this deployment, so the orchestrator team runs only through the task runner above."
          icon={<Cable className="size-5" aria-hidden />}
        />
      ) : (
        rows.map((assistant) => (
          <AssistantRow
            key={assistant.assistant_id}
            assistant={assistant}
            bindings={allBindings.filter((b) => b.assistant_id === assistant.assistant_id)}
            isAdmin={isAdmin}
          />
        ))
      )}
    </Card>
  )
}

/** A 404 from either assignment read means "not registered", not "no rows". */
function isMissingAssignments(...errors: unknown[]): boolean {
  return errors.some((error) => isApiError(error) && error.status === 404)
}

function AssistantRow({
  assistant,
  bindings,
  isAdmin,
}: {
  assistant: LearningAssistant
  bindings: LearningBinding[]
  isAdmin: boolean
}) {
  const agents = useLearningAgents()
  const roster = agents.data?.agents ?? []
  const enabledCount = enabledAgentCount(assistant.enabled_agents)

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="min-w-0 truncate font-mono text-sm font-semibold break-all">
          {assistant.assistant_id || '(unnamed assistant)'}
        </h3>
        <Badge variant="outline">
          {formatCount(enabledCount)}/{formatCount(assistant.agents.length)} enabled
        </Badge>
      </div>

      {bindings.length === 0 ? (
        <Empty
          compact
          title="No agents bound"
          hint="This assistant surface has no agent assigned to it yet."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {bindings.map((binding) => (
            <BindingRow key={`${binding.assistant_id}-${binding.agent_id}`} binding={binding} isAdmin={isAdmin} />
          ))}
        </ul>
      )}

      {isAdmin && <BindForm assistant={assistant} roster={roster} boundIds={bindings.map((b) => b.agent_id)} />}
    </section>
  )
}

function BindingRow({ binding, isAdmin }: { binding: LearningBinding; isAdmin: boolean }) {
  const unbind = useUnbindAgent()

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/60 px-3 py-2">
      <span className="min-w-0 truncate text-xs font-medium">
        {binding.agent_name || binding.agent_id}
      </span>
      <Badge variant="outline">{roleLabel(binding.role)}</Badge>
      {binding.agent_role && (
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
          {roleLabel(binding.agent_role)}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground">
        threshold{' '}
        <span className="font-mono">{formatScore(binding.confidence_threshold)}</span>
      </span>
      <Badge variant={binding.agent_enabled ? 'secondary' : 'outline'}>
        {binding.agent_enabled ? 'agent on' : 'agent off'}
      </Badge>
      {isAdmin && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto max-lg:h-10"
          disabled={unbind.isPending}
          onClick={() =>
            unbind.mutate(
              { assistantId: binding.assistant_id, agentId: binding.agent_id },
              {
                onSuccess: () =>
                  toast.success(`Unbound ${binding.agent_name || binding.agent_id}.`),
                onError: (error: unknown) =>
                  toast.error('Could not unbind', {
                    description: isApiError(error) ? error.message : String(error),
                  }),
              },
            )
          }
        >
          <Trash2 aria-hidden />
          Unbind
        </Button>
      )}
    </li>
  )
}

function BindForm({
  assistant,
  roster,
  boundIds,
}: {
  assistant: LearningAssistant
  roster: LearningAgent[]
  boundIds: string[]
}) {
  const bind = useBindAgent()
  const available = roster.filter((agent) => !boundIds.includes(agent.agent_id))
  const [agentId, setAgentId] = useState('')
  const [role, setRole] = useState('primary')

  const selected = roster.find((agent) => agent.agent_id === agentId)
  // Roles the registry actually uses, plus the server's own default so an
  // assistant can be bound without inventing a role.
  const roleOptions = useMemo(() => {
    const seen = new Set(roster.map((agent) => agent.role).filter(Boolean))
    seen.add('primary')
    return [...seen]
  }, [roster])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (bind.isPending || !agentId) return
    bind.mutate(
      { assistant_id: assistant.assistant_id, agent_id: agentId, role },
      {
        onSuccess: () => {
          toast.success(`Bound ${selected?.name ?? agentId} to ${assistant.assistant_id}.`)
          setAgentId('')
        },
        onError: (error: unknown) =>
          toast.error('Could not bind the agent', {
            description: isApiError(error) ? error.message : String(error),
          }),
      },
    )
  }

  if (available.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
        Every agent in the registry is already bound here — unbind one to move it.
      </p>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-dashed bg-background/40 p-3"
    >
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        Bind an agent
      </p>
      {/* One column at 375px; two from `sm`, three from `lg` — no fixed track
          widths, so nothing is squeezed into a sliver on a phone. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto] lg:items-end">
        <Field>
          <FieldLabel htmlFor={`bind-agent-${assistant.assistant_id}`}>Agent</FieldLabel>
          <Select
            value={agentId}
            onValueChange={(value) => {
              setAgentId(value)
              const agent = roster.find((row) => row.agent_id === value)
              if (agent?.role) setRole(agent.role)
            }}
            disabled={bind.isPending}
          >
            <SelectTrigger
              id={`bind-agent-${assistant.assistant_id}`}
              className="mt-1 h-10 w-full"
            >
              <SelectValue placeholder="Choose an agent…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((agent) => (
                <SelectItem key={agent.agent_id} value={agent.agent_id}>
                  {agent.name} · {roleLabel(agent.role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={`bind-role-${assistant.assistant_id}`}>Binding role</FieldLabel>
          <Select value={role} onValueChange={setRole} disabled={bind.isPending}>
            <SelectTrigger id={`bind-role-${assistant.assistant_id}`} className="mt-1 h-10 w-full">
              <SelectValue placeholder="Role…" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {roleLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Button type="submit" disabled={!agentId || bind.isPending} className="h-10 w-full lg:w-auto">
          <UserPlus aria-hidden />
          Bind
        </Button>
      </div>
    </form>
  )
}