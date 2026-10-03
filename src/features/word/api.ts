/** Endpoint bindings for the Word panel: the entry itself + 5 sub-resources. */

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
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

/** Encode a word for a path segment — corpus words can contain `/` and `?`. */
export function encodeWord(word: string): string {
  return encodeURIComponent(word.trim().toLowerCase())
}

function wordKey(word: string) {
  return word.trim().toLowerCase()
}

export function useWord(word: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['word', wordKey(word)],
    queryFn: async ({ signal }): Promise<Word> =>
      parseOrThrow(WordSchema, await apiGet<unknown>(`/word/${encodeWord(word)}`, { signal }), 'word'),
    enabled: (options.enabled ?? true) && word.trim().length > 0,
  })
}

export function useWordForms(word: string) {
  return useQuery({
    queryKey: ['word', wordKey(word), 'forms'],
    queryFn: async ({ signal }): Promise<WordForms> =>
      parseOrThrow(
        WordFormsSchema,
        await apiGet<unknown>(`/word/${encodeWord(word)}/forms`, { signal }),
        'word forms',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordContexts(word: string) {
  return useQuery({
    queryKey: ['word', wordKey(word), 'contexts'],
    queryFn: async ({ signal }): Promise<WordContexts> =>
      parseOrThrow(
        WordContextsSchema,
        await apiGet<unknown>(`/word/${encodeWord(word)}/contexts`, { signal }),
        'word contexts',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordCollocations(word: string) {
  return useQuery({
    queryKey: ['word', wordKey(word), 'collocations'],
    queryFn: async ({ signal }): Promise<WordCollocations> =>
      parseOrThrow(
        WordCollocationsSchema,
        await apiGet<unknown>(`/word/${encodeWord(word)}/collocations`, { signal }),
        'word collocations',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordPatterns(word: string) {
  return useQuery({
    queryKey: ['word', wordKey(word), 'patterns'],
    queryFn: async ({ signal }): Promise<WordPatterns> =>
      parseOrThrow(
        WordPatternsSchema,
        await apiGet<unknown>(`/word/${encodeWord(word)}/patterns`, { signal }),
        'word patterns',
      ),
    enabled: word.trim().length > 0,
  })
}

export function useWordEvidence(word: string) {
  return useQuery({
    queryKey: ['word', wordKey(word), 'evidence'],
    queryFn: async ({ signal }): Promise<WordEvidence> =>
      parseOrThrow(
        WordEvidenceSchema,
        await apiGet<unknown>(`/word/${encodeWord(word)}/evidence`, { signal }),
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

export const WORD_SUB_RESOURCES: { key: WordSubResource; label: string; hint: string }[] = [
  { key: 'contexts', label: 'Contexts', hint: 'GET /word/{w}/contexts — parallel Bible verses' },
  { key: 'collocations', label: 'Collocations', hint: 'GET /word/{w}/collocations — PMI pairs' },
  { key: 'patterns', label: 'Patterns', hint: 'GET /word/{w}/patterns — observed grammar patterns' },
  { key: 'evidence', label: 'Evidence', hint: 'GET /word/{w}/evidence — tiered provenance' },
  { key: 'forms', label: 'Forms', hint: 'GET /word/{w}/forms — observed surface forms' },
]