/**
 * Endpoint bindings for the Analyze and Search panels.
 *
 * All three are POST endpoints with a JSON body, so they run as mutations —
 * TanStack Query only fetches on demand here, matching the API contract.
 */

import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  ParagraphAnalysisSchema,
  SearchSchema,
  SentenceAnalysisSchema,
  parseOrThrow,
  type ParagraphAnalysis,
  type SearchResults,
  type SentenceAnalysis,
} from '../../lib/schemas'

export function useAnalyzeSentence() {
  return useMutation({
    mutationFn: async (text: string): Promise<SentenceAnalysis> =>
      parseOrThrow(
        SentenceAnalysisSchema,
        await apiPost<unknown>(endpointPath('analyze.sentence'), { text }),
        'sentence analysis',
      ),
  })
}

export function useAnalyzeParagraph() {
  return useMutation({
    mutationFn: async (text: string): Promise<ParagraphAnalysis> =>
      parseOrThrow(
        ParagraphAnalysisSchema,
        await apiPost<unknown>(endpointPath('analyze.paragraph'), { text }),
        'paragraph analysis',
      ),
  })
}

export function useSearch() {
  return useMutation({
    mutationFn: async ({
      query,
      limit,
    }: {
      query: string
      limit: number
    }): Promise<SearchResults> =>
      parseOrThrow(
        SearchSchema,
        await apiPost<unknown>(endpointPath('search.query'), { query, limit }),
        'search results',
      ),
  })
}