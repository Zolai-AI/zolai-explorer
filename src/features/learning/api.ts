/**
 * Endpoint bindings for the multi-agent learning system (`/api/v1/learning`).
 *
 * The reads are **public** — `GET /learning/overview`, `/learning/agents` and
 * `/learning/skills` carry no `require_scope` on the server, so an anonymous
 * visitor sees the whole roster. Only the management routes (enable/disable,
 * patch, bind/unbind) are `require_role("admin", strict=True)`, which is why the
 * page hides those controls on the role the server reports and still lets a 401
 * surface honestly through `ApiError`.
 *
 * Every function is a plain async transport + parse, exported so the node-env
 * tests can assert method, path and body against a stubbed `fetch`; the hooks
 * below are the React Query surface over them. No path literal appears here —
 * every URL comes from `endpointPath(id)`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiGet, apiPatch, apiPost } from '../../lib/api'
import { clampLimit, endpointPath } from '../../lib/endpoints'
import {
  LearningAgentsSchema,
  LearningAssistantsSchema,
  LearningAgentSchema,
  LearningBindingsSchema,
  LearningOverviewSchema,
  LearningRunSchema,
  LearningSkillsSchema,
  parseOrThrow,
  type LearningAgent,
  type LearningAgents,
  type LearningAssistants,
  type LearningBindings,
  type LearningOverview,
  type LearningRun,
  type LearningSkills,
} from '../../lib/schemas'

/* --------------------------------------------------------------- task menu */

/**
 * The orchestrator's task names, exactly as `learning_agents_router._BLOCKING`
 * enumerates them — a task outside this list answers HTTP 400 with the supported
 * set, so the menu never offers one and never hides one.
 */
export const LEARNING_TASK_IDS = [
  'translate',
  'validate_grammar',
  'correct_grammar',
  'learn_bible_patterns',
  'build_vocabulary',
  'extract_collocations',
] as const

export type LearningTaskId = (typeof LEARNING_TASK_IDS)[number]

/** An optional knob `RunIn` accepts, rendered only for the tasks that use it. */
export type LearningFieldId = 'source_lang' | 'target_lang' | 'pattern_type' | 'min_frequency'

export type LearningTaskSpec = {
  id: LearningTaskId
  label: string
  /** One line on what the task does, shown under the picker. */
  hint: string
  /** The task consumes `source_text` (the others are corpus-wide). */
  text: boolean
  fields: readonly LearningFieldId[]
}

export const LEARNING_TASKS: readonly LearningTaskSpec[] = [
  {
    id: 'translate',
    label: 'Translate',
    hint: 'Translate a sentence and ground it in the parallel Bible corpus.',
    text: true,
    fields: ['source_lang', 'target_lang'],
  },
  {
    id: 'validate_grammar',
    label: 'Validate grammar',
    hint: 'Check a Zolai sentence against the grammar agent; no correction is written.',
    text: true,
    fields: [],
  },
  {
    id: 'correct_grammar',
    label: 'Correct grammar',
    hint: 'Validate, then return the corrected sentence and what changed.',
    text: true,
    fields: [],
  },
  {
    id: 'learn_bible_patterns',
    label: 'Learn Bible patterns',
    hint: 'Mine word-order patterns from the Bible corpus (scales with `limit`).',
    text: false,
    fields: ['pattern_type'],
  },
  {
    id: 'build_vocabulary',
    label: 'Build vocabulary',
    hint: 'Expand the vocabulary table from the corpus (scales with `limit`).',
    text: false,
    fields: ['min_frequency'],
  },
  {
    id: 'extract_collocations',
    label: 'Extract collocations',
    hint: 'Mine collocations from the corpus (scales with `limit`).',
    text: false,
    fields: [],
  },
] as const

export function learningTask(id: LearningTaskId): LearningTaskSpec {
  return LEARNING_TASKS.find((task) => task.id === id) ?? LEARNING_TASKS[0]
}

/**
 * Scalar fields each task's `result` is known to carry, in display order.
 *
 * The result shape is per task (the API says so itself), so the panel names the
 * fields it can read and prints the raw record underneath — never a guess that
 * one task's keys exist for another.
 */
export const RESULT_SCALARS: Record<LearningTaskId, readonly string[]> = {
  translate: ['translation', 'source_lang', 'target_lang', 'cached'],
  validate_grammar: ['original', 'corrected', 'is_valid', 'confidence'],
  correct_grammar: ['original', 'corrected', 'is_valid', 'confidence'],
  learn_bible_patterns: ['pattern_type', 'patterns_found', 'learned_at'],
  build_vocabulary: ['vocabulary_size', 'min_frequency'],
  extract_collocations: ['vocabulary_size', 'min_frequency'],
}

/** The collection field a corpus task returns, and the columns worth showing. */
export const RESULT_ROWS: Partial<
  Record<LearningTaskId, { field: string; columns: readonly string[] }>
> = {
  learn_bible_patterns: {
    field: 'patterns',
    columns: ['structure', 'example_zo', 'example_en', 'frequency'],
  },
  build_vocabulary: { field: 'entries', columns: ['word', 'frequency', 'pos', 'learned_from'] },
  extract_collocations: { field: 'entries', columns: ['word', 'frequency', 'pos', 'learned_from'] },
}

/* ----------------------------------------------------------------- reads */

/** `GET /learning/overview` — counts, role histogram and the inline roster. */
export async function fetchLearningOverview(signal?: AbortSignal): Promise<LearningOverview> {
  return parseOrThrow(
    LearningOverviewSchema,
    await apiGet<unknown>(endpointPath('learning.overview'), { signal }),
    'learning overview',
  )
}

/** `GET /learning/agents` — the roster the team section renders. */
export async function fetchLearningAgents(signal?: AbortSignal): Promise<LearningAgents> {
  return parseOrThrow(
    LearningAgentsSchema,
    await apiGet<unknown>(endpointPath('learning.agents.list'), { signal }),
    'learning agents',
  )
}

/** `GET /learning/skills` — the catalog behind the badges on each agent. */
export async function fetchLearningSkills(signal?: AbortSignal): Promise<LearningSkills> {
  return parseOrThrow(
    LearningSkillsSchema,
    await apiGet<unknown>(endpointPath('learning.skills.list'), { signal }),
    'learning skills',
  )
}

/** `GET /learning/assistants` — assistant surfaces with their bound agents. */
export async function fetchLearningAssistants(signal?: AbortSignal): Promise<LearningAssistants> {
  return parseOrThrow(
    LearningAssistantsSchema,
    await apiGet<unknown>(endpointPath('learning.assistants.list'), { signal }),
    'learning assistants',
  )
}

/**
 * Build the bindings URL: `/learning/bindings`, or with the server's optional
 * `?assistant=<id>` filter when one is named. The value is encoded, so an id
 * cannot inject a second query parameter.
 */
export function bindingsPath(assistantId?: string): string {
  const base = endpointPath('learning.bindings.list')
  const id = assistantId?.trim()
  return id ? `${base}?assistant=${encodeURIComponent(id)}` : base
}

/** `GET /learning/bindings[?assistant=<id>]`. */
export async function fetchLearningBindings(
  assistantId?: string,
  signal?: AbortSignal,
): Promise<LearningBindings> {
  return parseOrThrow(
    LearningBindingsSchema,
    await apiGet<unknown>(bindingsPath(assistantId), { signal }),
    'learning bindings',
  )
}

/* ---------------------------------------------------------------- writes */

/** Body of `POST /learning/run` — every field the page collects, nothing else. */
export type LearningRunInput = {
  task: LearningTaskId
  source_text?: string
  source_lang?: string
  target_lang?: string
  pattern_type?: string
  limit?: number
  min_frequency?: number
}

/**
 * Run one orchestrator task.
 *
 * `limit` is clamped to the registry's documented bound before it goes on the
 * wire (the server 422s outside 1…5000). The server may clamp *further* — an
 * anonymous caller is capped at 50 — and it says so itself in
 * `limit_applied` / `limit_clamped`, which the panel reports verbatim.
 */
export async function postLearningRun(input: LearningRunInput): Promise<LearningRun> {
  const spec = learningTask(input.task)
  const body: Record<string, unknown> = { task: input.task }
  // Only what this task actually reads goes on the wire: `RunIn` has defaults
  // for every field, so sending `source_lang: en` to a corpus task would be
  // noise the server silently ignores — and the panel says otherwise.
  if (spec.text && input.source_text?.trim()) body.source_text = input.source_text.trim()
  if (spec.fields.includes('source_lang') && input.source_lang?.trim()) {
    body.source_lang = input.source_lang.trim()
  }
  if (spec.fields.includes('target_lang') && input.target_lang?.trim()) {
    body.target_lang = input.target_lang.trim()
  }
  if (spec.fields.includes('pattern_type') && input.pattern_type?.trim()) {
    body.pattern_type = input.pattern_type.trim()
  }
  if (spec.fields.includes('min_frequency') && input.min_frequency) {
    body.min_frequency = Math.max(1, Math.trunc(input.min_frequency))
  }
  body.limit = clampLimit('learning.run', input.limit ?? 10)
  return parseOrThrow(
    LearningRunSchema,
    await apiPost<unknown>(endpointPath('learning.run'), body),
    'learning run',
  )
}

/** Fields `PATCH /learning/agents/{id}` accepts — unset keys are not sent. */
export type LearningAgentUpdate = {
  name?: string
  role?: string
  skills?: string[]
  confidence_threshold?: number
  learning_rate?: number
  bible_priority?: boolean
}

/** Retune one agent. An unknown id answers 404 `unknown_agent`. */
export async function patchLearningAgent(
  agentId: string,
  update: LearningAgentUpdate,
): Promise<LearningAgent> {
  return parseOrThrow(
    LearningAgentSchema,
    await apiPatch<unknown>(endpointPath('learning.agents.update', { agent_id: agentId }), update),
    'learning agent',
  )
}

/** Enable or disable one agent — two endpoints, one honest switch. */
export async function postLearningAgentState(
  agentId: string,
  enabled: boolean,
): Promise<LearningAgent> {
  return parseOrThrow(
    LearningAgentSchema,
    await apiPost<unknown>(
      endpointPath(enabled ? 'learning.agents.enable' : 'learning.agents.disable', {
        agent_id: agentId,
      }),
      undefined,
    ),
    'learning agent',
  )
}

/** Bind an agent to an assistant with a role (201). */
export async function postLearningBinding(binding: {
  assistant_id: string
  agent_id: string
  role: string
}): Promise<unknown> {
  return apiPost<unknown>(endpointPath('learning.bindings.create'), {
    assistant_id: binding.assistant_id.trim(),
    agent_id: binding.agent_id.trim(),
    role: binding.role.trim() || 'primary',
  })
}

/** Unbind an agent from an assistant (204 — no body to parse). */
export async function deleteLearningBinding(assistantId: string, agentId: string): Promise<void> {
  await apiFetch<void>(
    endpointPath('learning.bindings.delete', {
      assistant_id: assistantId,
      agent_id: agentId,
    }),
    { method: 'DELETE' },
  )
}

/* ----------------------------------------------------------------- hooks */

export const LEARNING_KEYS = {
  overview: ['learning', 'overview'] as const,
  agents: ['learning', 'agents'] as const,
  skills: ['learning', 'skills'] as const,
  assistants: ['learning', 'assistants'] as const,
  bindings: (assistantId?: string) => ['learning', 'bindings', assistantId ?? null] as const,
}

export function useLearningOverview() {
  return useQuery({
    queryKey: LEARNING_KEYS.overview,
    queryFn: ({ signal }) => fetchLearningOverview(signal),
  })
}

export function useLearningAgents() {
  return useQuery({ queryKey: LEARNING_KEYS.agents, queryFn: ({ signal }) => fetchLearningAgents(signal) })
}

export function useLearningSkills() {
  return useQuery({ queryKey: LEARNING_KEYS.skills, queryFn: ({ signal }) => fetchLearningSkills(signal) })
}

export function useLearningAssistants() {
  return useQuery({
    queryKey: LEARNING_KEYS.assistants,
    queryFn: ({ signal }) => fetchLearningAssistants(signal),
  })
}

export function useLearningBindings(assistantId?: string) {
  return useQuery({
    queryKey: LEARNING_KEYS.bindings(assistantId),
    queryFn: ({ signal }) => fetchLearningBindings(assistantId, signal),
  })
}

/** Run a task on demand — never on mount. */
export function useRunLearningTask() {
  return useMutation({ mutationFn: (input: LearningRunInput) => postLearningRun(input) })
}

/** Retune one agent; the roster and the overview counts both move. */
export function useUpdateLearningAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, update }: { agentId: string; update: LearningAgentUpdate }) =>
      patchLearningAgent(agentId, update),
    onSuccess: () => void invalidateRoster(queryClient),
  })
}

/** Cache snapshot an optimistic toggle rolls back to. */
type ToggleContext = {
  agents: LearningAgents | undefined
  overview: LearningOverview | undefined
}

/** What the enable/disable toggle is asked to do. */
type ToggleVariables = { agentId: string; enabled: boolean }

/**
 * Enable/disable one agent, **optimistically**: the switch moves on click and
 * the roster is patched in place, because waiting a round trip to flip one
 * boolean reads as a broken control. A rejected write rolls the cache back to
 * the snapshot and re-throws to the caller, which toasts the real error — the
 * server is still the only authority on the state that persists.
 */
export function useSetAgentEnabled() {
  const queryClient = useQueryClient()
  return useMutation<LearningAgent, Error, ToggleVariables, ToggleContext>({
    mutationFn: ({ agentId, enabled }: ToggleVariables) => postLearningAgentState(agentId, enabled),
    onMutate: async ({ agentId, enabled }): Promise<ToggleContext> => {
      await queryClient.cancelQueries({ queryKey: LEARNING_KEYS.agents })
      const context: ToggleContext = {
        agents: queryClient.getQueryData<LearningAgents>(LEARNING_KEYS.agents),
        overview: queryClient.getQueryData<LearningOverview>(LEARNING_KEYS.overview),
      }
      queryClient.setQueryData<LearningAgents>(LEARNING_KEYS.agents, (current) =>
        current ? { ...current, agents: patchEnabled(current.agents, agentId, enabled) } : current,
      )
      queryClient.setQueryData<LearningOverview>(LEARNING_KEYS.overview, (current) =>
        current ? recountOverview(current) : current,
      )
      return context
    },
    onError: (_error: unknown, _variables: unknown, context: ToggleContext | undefined) => {
      if (!context) return
      queryClient.setQueryData(LEARNING_KEYS.agents, context.agents)
      queryClient.setQueryData(LEARNING_KEYS.overview, context.overview)
    },
    onSettled: () => void invalidateRoster(queryClient),
  })
}

/** Bind an agent to an assistant. */
export function useBindAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (binding: { assistant_id: string; agent_id: string; role: string }) =>
      postLearningBinding(binding),
    onSuccess: () => void invalidateAssignments(queryClient),
  })
}

/** Unbind an agent from an assistant. */
export function useUnbindAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assistantId, agentId }: { assistantId: string; agentId: string }) =>
      deleteLearningBinding(assistantId, agentId),
    onSuccess: () => void invalidateAssignments(queryClient),
  })
}

/* ------------------------------------------------------------- pure helpers */

function invalidateRoster(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: LEARNING_KEYS.agents }),
    queryClient.invalidateQueries({ queryKey: LEARNING_KEYS.overview }),
    queryClient.invalidateQueries({ queryKey: LEARNING_KEYS.skills }),
  ]).then(() => undefined)
}

function invalidateAssignments(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: LEARNING_KEYS.assistants }),
    queryClient.invalidateQueries({ queryKey: ['learning', 'bindings'] }),
  ]).then(() => undefined)
}

function patchEnabled(
  agents: readonly LearningAgent[],
  agentId: string,
  enabled: boolean,
): LearningAgent[] {
  return agents.map((agent) => (agent.agent_id === agentId ? { ...agent, enabled } : agent))
}

/**
 * Recount the overview totals from the optimistic roster.
 *
 * The server computes `agents_enabled` / `agents_disabled` itself; flipping one
 * row must move both numbers or the tiles disagree with the list under them.
 * `roles` is left alone — it is a histogram, not a state, and no write changes it.
 */
export function recountOverview(overview: LearningOverview): LearningOverview {
  const roster = overview.agents
  if (roster.length === 0) return overview
  const enabled = roster.filter((agent) => agent.enabled).length
  return {
    ...overview,
    agents_total: roster.length,
    agents_enabled: enabled,
    agents_disabled: roster.length - enabled,
  }
}

/**
 * `enabled_agents` is a count on some builds and a list of ids on others; the
 * panel only ever needs the number.
 */
export function enabledAgentCount(value: number | string[] | null | undefined): number {
  if (typeof value === 'number') return Math.max(0, Math.trunc(value))
  return Array.isArray(value) ? value.length : 0
}

/** Human label for a role id (`grammar_expert` → `Grammar expert`). */
export function roleLabel(role: string): string {
  const clean = role.trim()
  if (!clean) return '—'
  const words = clean.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}