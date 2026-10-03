/**
 * Zod schemas, one per endpoint, validated against the LIVE Zolai Core API.
 *
 * Every schema is deliberately *tolerant*: unknown keys are stripped, absent or
 * wrongly-typed fields fall back to a safe default (`.catch()`), and array
 * fields collapse to `[]`. The live API already returns empty arrays for
 * several fields (`forms`, `grammar_usage`, `pos` on `/analyze/sentence`), so a
 * strict schema would turn "no data yet" into a hard error in the UI.
 */

import { z } from 'zod'

const str = z.string().catch('')
const num = z.number().catch(0)
const strArray = z.array(z.string()).catch([])
const record = z.record(z.string(), z.unknown()).catch({})
const nullableNum = z.number().nullish().catch(null)

/* ------------------------------------------------------------------ health */

export const HealthSchema = z.object({
  status: str,
  version: str,
  data_root: str,
  uptime_s: num,
})
export type Health = z.infer<typeof HealthSchema>

/* --------------------------------------------------- knowledge / statistics */

export const StatisticsSchema = z.object({
  stats: z.record(z.string(), z.number()).catch({}),
})
export type Statistics = z.infer<typeof StatisticsSchema>

export const KnowledgeVersionSchema = z.object({
  version: str,
  git_commit: str,
  created_at: str,
})
export type KnowledgeVersion = z.infer<typeof KnowledgeVersionSchema>

/* -------------------------------------------------------------------- word */

/** `/word/{w}` collocations use `freq`; the `/collocations` sub-resource uses `frequency`. */
export const WordCollocationSchema = z.object({
  word1: str,
  word2: str,
  pmi: num,
  freq: num,
})
export type WordCollocation = z.infer<typeof WordCollocationSchema>

export const WordSchema = z.object({
  word: str,
  forms: strArray,
  frequency: num,
  document_frequency: num,
  sentence_frequency: num,
  pos: strArray,
  morphology: record,
  examples: strArray,
  collocations: z.array(WordCollocationSchema).catch([]),
  grammar_usage: z.array(record).catch([]),
  sources: strArray,
  confidence: num,
})
export type Word = z.infer<typeof WordSchema>

export const WordFormsSchema = z.object({
  word: str,
  forms: strArray,
})
export type WordForms = z.infer<typeof WordFormsSchema>

export const WordContextSchema = z.object({
  source: str,
  ref: str,
  en: str,
  zo_tdb77: str,
  zo_tedim2010: str,
})
export type WordContext = z.infer<typeof WordContextSchema>

export const WordContextsSchema = z.object({
  word: str,
  contexts: z.array(WordContextSchema).catch([]),
})
export type WordContexts = z.infer<typeof WordContextsSchema>

export const CollocationSchema = z.object({
  word1: str,
  word2: str,
  frequency: num,
  pmi: num,
})
export type Collocation = z.infer<typeof CollocationSchema>

export const WordCollocationsSchema = z.object({
  word: str,
  collocations: z.array(CollocationSchema).catch([]),
})
export type WordCollocations = z.infer<typeof WordCollocationsSchema>

export const PatternSchema = z.object({
  pattern_id: str,
  pattern: str,
  description: str,
  function: str,
  examples: strArray,
  confidence: nullableNum,
  status: str,
})
export type Pattern = z.infer<typeof PatternSchema>

export const WordPatternsSchema = z.object({
  word: str,
  patterns: z.array(PatternSchema).catch([]),
})
export type WordPatterns = z.infer<typeof WordPatternsSchema>

export const EvidenceSchema = z.object({
  source_type: str,
  source: str,
  tier: num,
  confidence: num,
  text: str,
  metadata: record,
})
export type Evidence = z.infer<typeof EvidenceSchema>

export const WordEvidenceSchema = z.object({
  word: str,
  evidence: z.array(EvidenceSchema).catch([]),
})
export type WordEvidence = z.infer<typeof WordEvidenceSchema>

/* ----------------------------------------------------------------- analyze */

export const SentenceAnalysisSchema = z.object({
  text: str,
  tokens: strArray,
  // Not populated by the live API yet — always [] today.
  pos: strArray,
  grammar: z.array(record).catch([]),
  entities: z.array(record).catch([]),
})
export type SentenceAnalysis = z.infer<typeof SentenceAnalysisSchema>

export const ParagraphAnalysisSchema = z.object({
  text: str,
  sentences: strArray,
  // Thin on the live API: `{status, note, tokens_per_sentence[]}`.
  analysis: record,
})
export type ParagraphAnalysis = z.infer<typeof ParagraphAnalysisSchema>

/* ------------------------------------------------------------------ search */

export const SearchHitSchema = z.object({
  id: str,
  text: str,
  score: num,
  source: str,
  metadata: record,
})
export type SearchHit = z.infer<typeof SearchHitSchema>

export const SearchSchema = z.object({
  query: str,
  results: z.array(SearchHitSchema).catch([]),
})
export type SearchResults = z.infer<typeof SearchSchema>

/* --------------------------------------------------------------------- rag */

export const CitationSchema = z.object({
  id: z.union([z.number(), z.string()]).catch(0),
  source: str,
  text: str,
})
export type Citation = z.infer<typeof CitationSchema>

export const RagSchema = z.object({
  question: str,
  context: str,
  citations: z.array(CitationSchema).catch([]),
  // Placeholder text echoed from the retrieved snippets — NOT LLM-generated.
  answer: str,
  retrieved_count: num,
})
export type RagResult = z.infer<typeof RagSchema>

/* ------------------------------------------------------------------ helpers */

/** Parse with a named schema, surfacing a readable error instead of a raw ZodError. */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new Error(
      `Unexpected ${label} payload: ${first ? `${first.path.join('.') || '(root)'} ${first.message}` : 'validation failed'}`,
    )
  }
  return result.data
}