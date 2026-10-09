/**
 * Endpoint bindings for the agent runs surface (`/agent/runs`).
 *
 * - `postAgentRun` — `POST /runs` runs the agent **synchronously** server-side
 *   (≤60s budget), so the client asks for a 65s timeout instead of the default
 *   15s; the server also rate-limits to 5 runs/min/key (429).
 * - `fetchAgentRun` — `GET /runs/{id}`; the hook polls it while the row is
 *   still `running` and settles on the final state.
 * - `postRunFeedback` — `POST /runs/{id}/feedback`, thumbs `-1 | 1`
 *   (`score >= 1` fires the server's learn phase).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  AgentRunSchema,
  FeedbackSchema,
  parseOrThrow,
  type AgentRun,
  type FeedbackResult,
  type ProviderSelection,
} from '../../lib/schemas'

const BASE = endpointPath('agent.run.create')

/** Server runs up to 60s; give the wire a little headroom. */
export const RUN_TIMEOUT_MS = 65_000

/** Thumbs vocabulary the UI sends; the server accepts -1..1 (`score >= 1` = learn). */
export type FeedbackScore = -1 | 0 | 1

const runKey = (id: number) => ['agent', 'run', id] as const

/**
 * Body builder — `provider` / `model` are an optional per-request override,
 * echoed back by the server as `requested_provider` / `requested_model`.
 */
export function agentRunBody(goal: string, selection?: ProviderSelection): Record<string, unknown> {
  const body: Record<string, unknown> = { goal }
  if (selection?.provider) body.provider = selection.provider
  if (selection?.model) body.model = selection.model
  return body
}

export async function postAgentRun(
  goal: string,
  selection?: ProviderSelection,
): Promise<AgentRun> {
  return parseOrThrow(
    AgentRunSchema,
    await apiPost<unknown>(BASE, agentRunBody(goal, selection), { timeoutMs: RUN_TIMEOUT_MS }),
    'agent run',
  )
}

export async function fetchAgentRun(runId: number, signal?: AbortSignal): Promise<AgentRun> {
  return parseOrThrow(
    AgentRunSchema,
    await apiGet<unknown>(endpointPath('agent.run.read', { run_id: runId }), { signal }),
    'agent run',
  )
}

export async function postRunFeedback(
  runId: number,
  score: FeedbackScore,
): Promise<FeedbackResult> {
  return parseOrThrow(
    FeedbackSchema,
    await apiPost<unknown>(endpointPath('agent.run.feedback', { run_id: runId }), { score }),
    'run feedback',
  )
}

export function useRunAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      goal,
      selection,
    }: {
      goal: string
      selection?: ProviderSelection
    }): Promise<AgentRun> => postAgentRun(goal, selection),
    onSuccess: (run) => {
      if (run.id > 0) void queryClient.invalidateQueries({ queryKey: runKey(run.id) })
      void queryClient.invalidateQueries({ queryKey: ['agent', 'runs'] })
    },
  })
}

/** Poll one run while it is still `running`; settles on the final row. */
export function useAgentRun(runId: number | null) {
  // Explicit generic: the `refetchInterval` callback reads `query.state.data`,
  // which would otherwise make TS infer the payload as `unknown` (circular).
  return useQuery<AgentRun>({
    queryKey: runKey(runId ?? 0),
    enabled: runId !== null && runId > 0,
    // A finished run is immutable — no need to keep hitting the API.
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      // Stop on a settled error (e.g. honest 404) instead of hammering it.
      if (query.state.status === 'error') return false
      const status = query.state.data?.status
      return status === undefined || status === 'running' ? 2_000 : false
    },
    queryFn: ({ signal }) => fetchAgentRun(runId ?? 0, signal),
  })
}

export function useSendFeedback(runId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (score: FeedbackScore): Promise<FeedbackResult> =>
      postRunFeedback(runId, score),
    // The learn phase mutates the run row (feedback_score) server-side.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: runKey(runId) }),
  })
}
