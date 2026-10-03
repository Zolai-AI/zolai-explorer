/** Endpoint bindings for the Data panel (statistics, knowledge version). */

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import {
  KnowledgeVersionSchema,
  StatisticsSchema,
  parseOrThrow,
  type KnowledgeVersion,
  type Statistics,
} from '../../lib/schemas'

export function useStatistics() {
  return useQuery({
    queryKey: ['statistics'],
    queryFn: async ({ signal }): Promise<Statistics> =>
      parseOrThrow(StatisticsSchema, await apiGet<unknown>('/knowledge/statistics', { signal }), 'statistics'),
  })
}

export function useKnowledgeVersion() {
  return useQuery({
    queryKey: ['knowledge', 'version'],
    queryFn: async ({ signal }): Promise<KnowledgeVersion> =>
      parseOrThrow(
        KnowledgeVersionSchema,
        await apiGet<unknown>('/knowledge/version', { signal }),
        'knowledge version',
      ),
  })
}