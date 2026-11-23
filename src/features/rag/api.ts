/**
 * Endpoint binding for the RAG panel.
 *
 * `RAGRequest` on the server accepts an optional `provider` / `model` override
 * and documents it as "resolved exactly as the assistant resolves them" — this
 * binding had never sent them, so the panel could only ever use whatever the
 * deployment had configured. The override is omitted when unset, which is what
 * keeps the server's own resolution in charge; there is no `user_provider`,
 * because the client must not name a vendor.
 */
import { useMutation } from '@tanstack/react-query'
import { apiPost, LONG_RUNNING_TIMEOUT_MS } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  RagSchema,
  parseOrThrow,
  type ProviderSelection,
  type RagResult,
} from '../../lib/schemas'

export const RAG_LIMITS = [3, 5, 10] as const

/** Retrieval plus provider generation can consume the server's 60s budget. */
export const RAG_TIMEOUT_MS = LONG_RUNNING_TIMEOUT_MS
export const RAG_REQUEST_OPTIONS = { timeoutMs: RAG_TIMEOUT_MS } as const

/** Pure body builder, so the override rules are unit-testable. */
export function ragBody(
  question: string,
  limit: number,
  selection?: ProviderSelection,
): Record<string, unknown> {
  const body: Record<string, unknown> = { question, limit }
  if (selection?.provider) body.provider = selection.provider
  if (selection?.model) body.model = selection.model
  return body
}

export function useRag() {
  return useMutation({
    mutationFn: async ({
      question,
      limit,
      selection,
    }: {
      question: string
      limit: number
      selection?: ProviderSelection
    }): Promise<RagResult> =>
      parseOrThrow(
        RagSchema,
        await apiPost<unknown>(endpointPath('rag.ask'), ragBody(question, limit, selection), {
          // A model call plus retrieval; the default 15s is too tight once a
          // provider answers, which would surface as a fake timeout.
          ...RAG_REQUEST_OPTIONS,
        }),
        'rag',
      ),
  })
}