/** Endpoint binding for the RAG panel. */

import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../../lib/api'
import { RagSchema, parseOrThrow, type RagResult } from '../../lib/schemas'

export const RAG_LIMITS = [3, 5, 10] as const

export function useRag() {
  return useMutation({
    mutationFn: async ({
      question,
      limit,
    }: {
      question: string
      limit: number
    }): Promise<RagResult> =>
      parseOrThrow(RagSchema, await apiPost<unknown>('/rag', { question, limit }), 'rag'),
  })
}