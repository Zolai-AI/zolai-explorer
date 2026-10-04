/**
 * Zod schemas + submit handlers for the three validated inputs in the app:
 * the API-key dialog, the word explorer lookup and the corpus-search query.
 *
 * **Why the handlers live here and not in the components.** `useForm` + a zod
 * resolver covers live inline validation, but the *effect* of a valid submit
 * (trim, lower-case, build the route, clamp the limit) is business logic and
 * deserves a test. The vitest environment is `node` with no DOM, so handlers
 * are exported as pure functions over plain values: the components call them
 * inside `handleSubmit`, and `forms.test.ts` exercises them directly.
 *
 * This module holds **no credential material** — the API key is only ever
 * passed through `submitApiKey`, never stored, logged or echoed.
 */

import { z } from 'zod'

/* ----------------------------------------------------------------- schemas */

/**
 * Schemas are **object** shaped because `useForm` needs a record of field
 * values; the fields themselves carry the rules.
 */
const apiKeyField = z
  .string()
  .trim()
  .min(1, 'Enter the API key — an empty value would silently keep public access.')
  .max(512, 'That is longer than any API key. Check for a stray paste.')

export const apiKeySchema = z.object({ apiKey: apiKeyField })
export type ApiKeyInput = z.infer<typeof apiKeySchema>

/**
 * A Zolai headword: letters plus the separator characters the lexicon actually
 * uses (`-`, `'`, space). Accents/marks are allowed so a future ZVS
 * diacritic-bearing romanisation is not silently rejected.
 */
export const WORD_PATTERN = /^[\p{L}\p{M}'’\- ]+$/u

const wordField = z
  .string()
  .trim()
  .min(1, 'Enter a word to explore, e.g. pasian.')
  .max(64, 'A headword is at most 64 characters.')
  .regex(WORD_PATTERN, 'Use letters only — hyphens, apostrophes and spaces are fine.')

export const wordLookupSchema = z.object({ word: wordField })
export type WordLookupInput = z.infer<typeof wordLookupSchema>
/** The bare field schema, for callers that validate a single string. */
export const wordFieldSchema = wordField

const searchQueryField = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters.')
  .max(120, 'Keep the query under 120 characters.')

export const searchQuerySchema = z.object({ query: searchQueryField })
export type SearchQueryInput = z.infer<typeof searchQuerySchema>

export const SEARCH_LIMIT_CHOICES = [5, 10, 25, 50] as const
export const DEFAULT_SEARCH_LIMIT = 10

/** Guard against a hand-edited `<Select>` value reaching the API. */
export function coerceSearchLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_SEARCH_LIMIT
  const clamped = Math.min(Math.max(Math.trunc(n), 1), 100)
  return SEARCH_LIMIT_CHOICES.includes(clamped as (typeof SEARCH_LIMIT_CHOICES)[number])
    ? clamped
    : DEFAULT_SEARCH_LIMIT
}

/* ---------------------------------------------------------------- handlers */

/** Discriminated result so callers can branch without throwing. */
export type SubmitResult<T> = { ok: true; value: T } | { ok: false; issues: string[] }

/**
 * Run a schema and flatten its issues to messages. Kept generic so a caller can
 * reuse it for any future form.
 */
export function validateWith<T extends z.ZodType>(
  schema: T,
  values: unknown,
): SubmitResult<z.infer<T>> {
  const result = schema.safeParse(values)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => issue.message || 'Invalid value.'),
  }
}

/**
 * API-key submit. Returns the *trimmed* key only when the schema passes, so an
 * all-whitespace paste can never overwrite a good key with an empty string.
 * The value is handed straight to `setApiKey` (localStorage) and nowhere else.
 */
export function submitApiKey(values: { apiKey?: unknown } | unknown): SubmitResult<string> {
  const raw =
    values && typeof values === 'object' && 'apiKey' in values
      ? (values as { apiKey: unknown }).apiKey
      : values
  const result = validateWith(apiKeyField, raw)
  if (!result.ok) return result
  const trimmed = result.value.trim()
  if (trimmed === '') {
    return { ok: false, issues: ['Enter the API key — an empty value would silently keep public access.'] }
  }
  return { ok: true, value: trimmed }
}

/** Word-lookup submit: trims, lower-cases and builds the route path. */
export function submitWordLookup(values: unknown): SubmitResult<{ word: string; path: string }> {
  const result = validateWith(wordFieldSchema, values)
  if (!result.ok) return result
  const word = result.value.toLowerCase().replace(/\s+/g, ' ').trim()
  if (word === '') {
    return { ok: false, issues: ['Enter a word to explore, e.g. pasian.'] }
  }
  return { ok: true, value: { word, path: wordPath(word) } }
}

/** `/word/{word}` route for a headword, URL-encoded. */
export function wordPath(word: string): string {
  return `/word/${encodeURIComponent(word.trim().toLowerCase())}`
}

/** Search submit: validated query + clamped limit, ready for the mutation. */
export function submitSearch(
  values: { query?: unknown; limit?: unknown },
): SubmitResult<{ query: string; limit: number }> {
  const result = validateWith(searchQueryField, values?.query)
  if (!result.ok) return result
  return { ok: true, value: { query: result.value, limit: coerceSearchLimit(values?.limit) } }
}
