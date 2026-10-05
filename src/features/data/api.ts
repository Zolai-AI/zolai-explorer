/** Endpoint bindings for the Data panel (statistics, knowledge version). */

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  FoundationStatsSchema,
  KnowledgeVersionSchema,
  StatisticsSchema,
  parseOrThrow,
  type FoundationStats,
  type KnowledgeVersion,
  type Statistics,
} from '../../lib/schemas'

export function useStatistics() {
  return useQuery({
    queryKey: ['statistics'],
    queryFn: async ({ signal }): Promise<Statistics> =>
      parseOrThrow(StatisticsSchema, await apiGet<unknown>(endpointPath('knowledge.statistics'), { signal }), 'statistics'),
  })
}

export function useKnowledgeVersion() {
  return useQuery({
    queryKey: ['knowledge', 'version'],
    queryFn: async ({ signal }): Promise<KnowledgeVersion> =>
      parseOrThrow(
        KnowledgeVersionSchema,
        await apiGet<unknown>(endpointPath('knowledge.version'), { signal }),
        'knowledge version',
      ),
  })
}

/**
 * Optional surface: `/foundation/stats` only exists when the deployment
 * registers the foundation router, so it never retries and callers are expected
 * to render nothing when it fails rather than surface an error.
 */
export function useFoundationStats() {
  return useQuery({
    queryKey: ['foundation', 'stats'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<FoundationStats> =>
      parseOrThrow(
        FoundationStatsSchema,
        await apiGet<unknown>(endpointPath('foundation.stats'), { signal }),
        'foundation stats',
      ),
  })
}