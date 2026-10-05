/**
 * Endpoint bindings for the Word panel: the entry itself + 5 sub-resources.
 *
 * Paths come from the registry in `src/lib/endpoints.ts` — no literal route
 * string lives here, so the Links page, the README and the actual calls cannot
 * drift apart. Each sub-resource carries the server-side `limit` in its query
 * key, so changing the page size refetches instead of paging a cached array.
 */

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import { clampLimit, endpointPath, queryLimitPath, type EndpointId } from '../../lib/endpoints'
import {
  WordCollocationsSchema,
  WordContextsSchema,
  WordEvidenceSchema,
  WordFormsSchema,
  WordPatternsSchema,
  WordSchema,
  parseOrThrow,
  type Word,
  type WordCollocations,
  type WordContexts,
  type WordEvidence,
  type WordForms,
  type WordPatterns,
} from '../../lib/schemas'

/**
 * Choices offered by the limit control. `forms/contexts/collocations/patterns`
 * are capped at 100 server-side, `evidence` at 200, so the shared choices stop
 * at 100 and the evidence row raises its own ceiling to 200.
 */
export const WORD_LIMIT_CHOICES = [10, 20, 50, 100] as const
export const EVIDENCE_LIMIT_CHOICES = [10, 20, 50, 100, 200] as const
export const DEFAULT_WORD_LIMIT = 20
export const DEFAULT_EVIDENCE_LIMIT = 50

/** Limit choices for one sub-resource tab (evidence has the 200 ceiling). */
export function wordLimitChoices(sub: WordSubResource): readonly number[] {
  return sub === 'evidence' ? EVIDENCE_LIMIT_CHOICES : WORD_LIMIT_CHOICES
}

/** Server default `limit` for one sub-resource tab. */
export function defaultWordLimit(sub: WordSubResource): number {
  return sub === 'evidence' ? DEFAULT_EVIDENCE_LIMIT : DEFAULT_WORD_LIMIT
}

/** Clamp to one of the offered choices, falling back to that route's default. */
export function coerceWordLimit(raw: unknown, sub: WordSubResource = 'contexts'): number {
  const id = SUB_RESOURCE_ENDPOINT[sub]
  const choices = wordLimitChoices(sub)
  const fallback = defaultWordLimit(sub)
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  const clamped = clampLimit(id, parsed)
  return choices.includes(clamped) ? clamped : fallback
}

/** Lower-cased word used for cache keys and the request path. */
export function wordKey(word: string): string {
  return word.trim().toLowerCase()
}

export function useWord(word: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['word', wordKey(word)],
    queryFn: async ({ signal }): Promise<Word> =>
      parseOrThrow(
        WordSchema,
        await apiGet<unknown>(endpointPath('word.entry', { word }), { signal }),
        'word',
      ),
    enabled: (options.enabled ?? true) && word.trim().length > 0,
  })
}

export function useWordForms(word: string, limit: number = DEFAULT_WORD_LIMIT) {
  const effective = clampLimit('word.forms', limit)
  return useQuery({
    queryKey: ['word', wordKey(word), 'forms', effective],
    queryFn: async ({ signal }): Promise<WordForms> =>
      parseOrThrow(
        WordFormsSchema,
        await apiGet<unknown>(queryLimitPath('word.forms', { word }, effective), { signal }),
        'word forms',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordContexts(word: string, limit: number = DEFAULT_WORD_LIMIT) {
  const effective = clampLimit('word.contexts', limit)
  return useQuery({
    queryKey: ['word', wordKey(word), 'contexts', effective],
    queryFn: async ({ signal }): Promise<WordContexts> =>
      parseOrThrow(
        WordContextsSchema,
        await apiGet<unknown>(queryLimitPath('word.contexts', { word }, effective), { signal }),
        'word contexts',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordCollocations(word: string, limit: number = DEFAULT_WORD_LIMIT) {
  const effective = clampLimit('word.collocations', limit)
  return useQuery({
    queryKey: ['word', wordKey(word), 'collocations', effective],
    queryFn: async ({ signal }): Promise<WordCollocations> =>
      parseOrThrow(
        WordCollocationsSchema,
        await apiGet<unknown>(queryLimitPath('word.collocations', { word }, effective), { signal }),
        'word collocations',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordPatterns(word: string, limit: number = DEFAULT_WORD_LIMIT) {
  const effective = clampLimit('word.patterns', limit)
  return useQuery({
    queryKey: ['word', wordKey(word), 'patterns', effective],
    queryFn: async ({ signal }): Promise<WordPatterns> =>
      parseOrThrow(
        WordPatternsSchema,
        await apiGet<unknown>(queryLimitPath('word.patterns', { word }, effective), { signal }),
        'word patterns',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordEvidence(word: string, limit: number = DEFAULT_EVIDENCE_LIMIT) {
  const effective = clampLimit('word.evidence', limit)
  return useQuery({
    queryKey: ['word', wordKey(word), 'evidence', effective],
    queryFn: async ({ signal }): Promise<WordEvidence> =>
      parseOrThrow(
        WordEvidenceSchema,
        await apiGet<unknown>(queryLimitPath('word.evidence', { word }, effective), { signal }),
        'word evidence',
      ),
    enabled: word.trim().length > 0,
  })
}

export type WordSubResource =
  | 'contexts'
  | 'collocations'
  | 'patterns'
  | 'evidence'
  | 'forms'

/** Registry id per sub-resource tab — the limit control clamps through it. */
export const SUB_RESOURCE_ENDPOINT: Record<WordSubResource, EndpointId> = {
  contexts: 'word.contexts',
  collocations: 'word.collocations',
  patterns: 'word.patterns',
  evidence: 'word.evidence',
  forms: 'word.forms',
}

export const WORD_SUB_RESOURCES: { key: WordSubResource; label: string; hint: string }[] = [
  {
    key: 'contexts',
    label: 'Contexts',
    hint: 'GET /word/{w}/contexts — parallel Bible verses (limit in the query string)',
  },
  {
    key: 'collocations',
    label: 'Collocations',
    hint: 'GET /word/{w}/collocations — PMI pairs (limit in the query string)',
  },
  {
    key: 'patterns',
    label: 'Patterns',
    hint: 'GET /word/{w}/patterns — observed grammar patterns (limit in the query string)',
  },
  {
    key: 'evidence',
    label: 'Evidence',
    hint: 'GET /word/{w}/evidence — tiered provenance, capped at 200',
  },
  {
    key: 'forms',
    label: 'Forms',
    hint: 'GET /word/{w}/forms — observed surface forms (limit in the query string)',
  },
]