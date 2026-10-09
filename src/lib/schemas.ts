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
const bool = z.boolean().catch(false)
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

/**
 * `/foundation/stats` — curation counters for the knowledge pipeline.
 *
 * Optional surface: it 404s on deployments that do not register the foundation
 * router, so the dashboard treats a failure as "this card does not render"
 * rather than an error the user has to read.
 */
export const FoundationStatsSchema = z.object({
  raw_count: num,
  staging_count: num,
  canonical_count: num,
  evidence_count: num,
  review_pending_count: num,
  review_resolved_count: num,
  batches_count: num,
})
export type FoundationStats = z.infer<typeof FoundationStatsSchema>

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

/* ------------------------------------------------------------------ auth */

/**
 * `GET /auth/me` — public identity probe. `role` is
 * `anonymous | member | admin`; anything unrecognised collapses to
 * `anonymous` (the least-privileged reading) instead of failing the gate.
 */
export const AuthMeSchema = z.object({
  role: z.enum(['anonymous', 'member', 'admin']).catch('anonymous'),
  key_prefix: z.string().nullish().catch(null),
  scopes: strArray,
  mode: str,
  // Additive fields (tolerant): may be added by the server without breaking clients.
  username: z.string().nullish().catch(null),
  auth_source: z.enum(['api-key', 'session', 'none']).catch('none'),
})
export type AuthMe = z.infer<typeof AuthMeSchema>

export type Role = AuthMe['role']

/** `POST /auth/login` request — tolerant so a partial payload degrades instead of throwing. */
export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(128).catch(''),
  password: z.string().min(1).max(256).catch(''),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

/** `POST /auth/login` response — session token + metadata. */
export const LoginResponseSchema = z.object({
  token: z.string().catch(''),
  expires_at: z.number().catch(0),
  username: z.string().catch(''),
  role: z.enum(['anonymous', 'member', 'admin']).catch('anonymous'),
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

/** `POST /auth/logout` request — empty body. */
export const LogoutRequestSchema = z.object({}).catch({})
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>

/* -------------------------------------------------------------- providers */

/** Masked secret view — the API never returns a plaintext key. */
export const ProviderSecretSchema = z
  .object({
    mode: z.enum(['env', 'encrypted', 'none']).catch('none'),
    ref_masked: str,
    configured: bool,
  })
  .catch({ mode: 'none', ref_masked: '', configured: false })
export type ProviderSecret = z.infer<typeof ProviderSecretSchema>

/** One `ai_providers` catalog row as served by `/admin/ai-providers`. */
export const ProviderSchema = z.object({
  catalog_id: str,
  name: str,
  adapter: z.enum(['brain', 'openai', 'openrouter', 'custom']).catch('custom'),
  base_url: str,
  models: strArray,
  selected_model: str,
  docs: str,
  requires_key: bool,
  enabled: bool,
  is_active: bool,
  tier: str,
  timeout_s: num,
  secret: ProviderSecretSchema,
})
export type Provider = z.infer<typeof ProviderSchema>

export const ProviderListSchema = z.object({
  items: z.array(ProviderSchema).catch([]),
  count: num,
})
export type ProviderList = z.infer<typeof ProviderListSchema>

/** `POST /admin/ai-providers/{id}/test` — 1-token probe result. */
export const ProviderTestSchema = z.object({
  catalog_id: str,
  ok: bool,
  status: z.number().nullish().catch(null),
  latency_ms: num,
  error: z.string().nullish().catch(null),
  model: z.string().nullish().catch(null),
})
export type ProviderTest = z.infer<typeof ProviderTestSchema>

/** `POST /admin/ai-providers/{id}/activate` — single active row. */
export const ActivateSchema = z.object({
  catalog_id: str,
  is_active: bool,
  active_count: num,
})
export type ActivateResult = z.infer<typeof ActivateSchema>

/**
 * `GET /api/v1/providers` — the **public** projection of the catalog: exactly
 * the five fields a client needs to choose a target, zero secrets by
 * construction (the admin row's `secret` / `enabled` / bookkeeping never leave
 * the admin routes). Anon-safe in every auth mode.
 */
export const PublicProviderSchema = z.object({
  catalog_id: str,
  name: str,
  adapter: str,
  models: strArray,
  selected_model: str,
})
export type PublicProvider = z.infer<typeof PublicProviderSchema>

export const ProviderCatalogSchema = z.object({
  items: z.array(PublicProviderSchema).catch([]),
  count: num,
})
export type ProviderCatalog = z.infer<typeof ProviderCatalogSchema>

/**
 * `POST /admin/ai-providers/{id}/refresh-models`. `source` is honest about
 * where the list came from: `remote` answered the provider's models endpoint,
 * `catalog` returned the row's declared list unchanged.
 */
export const RefreshModelsSchema = z.object({
  catalog_id: str,
  models: strArray,
  source: z.enum(['remote', 'catalog']).catch('catalog'),
})
export type RefreshModels = z.infer<typeof RefreshModelsSchema>

/**
 * The optional per-request `provider` / `model` override shared by
 * `POST /assistant/chat`, `POST /admin/assistant/chat` and `POST /agent/runs`.
 * Empty strings mean "no override — keep the server default", and the response
 * echoes what was asked for as `requested_provider` / `requested_model`.
 */
export const ProviderSelectionSchema = z.object({
  provider: str,
  model: str,
})
export type ProviderSelection = z.infer<typeof ProviderSelectionSchema>

/* -------------------------------------------------------------- api keys */

/**
 * One row of the `api_keys` table as served by `GET /admin/api-keys`.
 *
 * The server stores a SHA-256 hash and a display prefix — there is no plaintext
 * to return. `revoked_at` non-null means the key is rejected from the next
 * request on.
 */
export const ApiKeyRecordSchema = z.object({
  id: num,
  name: str,
  key_prefix: str,
  key_hash: str,
  scopes: strArray,
  created_by: str,
  created_at: str,
  expires_at: z.string().nullish().catch(null),
  last_used_at: z.string().nullish().catch(null),
  revoked_at: z.string().nullish().catch(null),
})
export type ApiKeyRecord = z.infer<typeof ApiKeyRecordSchema>

export const ApiKeyListSchema = z.object({
  items: z.array(ApiKeyRecordSchema).catch([]),
  count: num,
})
export type ApiKeyList = z.infer<typeof ApiKeyListSchema>

/**
 * `POST /admin/api-keys` and `POST /admin/api-keys/{id}/rotate` — the only
 * responses that ever carry a plaintext secret, and only once. The caller must
 * show it and drop it: never cache it, never toast it, never echo it.
 */
export const ApiKeyIssuedSchema = z.object({
  key: ApiKeyRecordSchema,
  plaintext: str,
})
export type ApiKeyIssued = z.infer<typeof ApiKeyIssuedSchema>

export const ApiKeyRotateSchema = ApiKeyIssuedSchema.extend({
  old_id: num,
})
export type ApiKeyRotated = z.infer<typeof ApiKeyRotateSchema>

/** `POST /admin/api-keys/{id}/revoke`. */
export const ApiKeyRevokedSchema = z.object({
  id: num,
  revoked_at: str,
})
export type ApiKeyRevoked = z.infer<typeof ApiKeyRevokedSchema>

/* ------------------------------------------------------------ admin users */

/**
 * One account as `GET/POST /admin/users` and `PUT /admin/users/{username}`
 * serve it — `sanitize_user` strips the argon2 `password_hash`, and no token is
 * ever part of the payload. The server stores `enabled` as `0 | 1`; the schema
 * normalises it to a boolean so the panel never branches on a number.
 */
export const AdminUserSchema = z.object({
  id: num,
  username: str,
  display_name: z.string().nullish().catch(null),
  role: z.enum(['member', 'admin']).catch('member'),
  enabled: z
    .union([z.boolean(), z.number()])
    .catch(false)
    .transform((value) => value === true || value === 1),
  created_at: str,
  updated_at: str,
  last_login: z.string().nullish().catch(null),
})
export type AdminUser = z.infer<typeof AdminUserSchema>

export const AdminUserListSchema = z.object({
  items: z.array(AdminUserSchema).catch([]),
  count: num,
})
export type AdminUserList = z.infer<typeof AdminUserListSchema>

/** `POST /admin/users` and `PUT /admin/users/{username}` — `{user: …}` envelope. */
export const AdminUserEnvelopeSchema = z.object({
  user: AdminUserSchema,
})
export type AdminUserEnvelope = z.infer<typeof AdminUserEnvelopeSchema>

/** `POST /admin/users/{username}/revoke-sessions` — a count, never a token. */
export const RevokeSessionsSchema = z.object({
  username: str,
  revoked: num,
})
export type RevokeSessionsResult = z.infer<typeof RevokeSessionsSchema>

/* ------------------------------------------------------------- assistant */

/** Citation shape returned by the assistant routes (`{source, ref, text, score}`). */
export const AssistantCitationSchema = z.object({
  source: str,
  ref: str,
  text: str,
  score: num,
})
export type AssistantCitation = z.infer<typeof AssistantCitationSchema>

/** One tool call in the assistant/agent trace. */
export const ToolCallSchema = z.object({
  name: str,
  ok: bool,
  status: str,
  latency_ms: num,
  turn: num,
  input: record,
  data: record,
  error: str,
})
export type ToolCall = z.infer<typeof ToolCallSchema>

/**
 * Chat payload shared by `POST /assistant/chat` and
 * `POST /admin/assistant/chat`. `retrieval_only: true` means the server
 * answered from retrieval with **no model** — the UI must label it as such
 * and never as "generated".
 */
export const ChatResponseSchema = z.object({
  answer: str,
  citations: z.array(AssistantCitationSchema).catch([]),
  tool_calls: z.array(ToolCallSchema).catch([]),
  turns: num,
  /** The provider/model that actually answered (`''` on a retrieval fallback). */
  provider: str,
  model: str,
  /** What the caller *asked* for (`''` when no override was sent). */
  requested_provider: str,
  requested_model: str,
  mode: str,
  retrieval_only: bool,
  latency_ms: num,
  zvs: record,
  provider_error: str,
  loop_error: str,
  persisted_run_id: nullableNum,
})
export type ChatResponse = z.infer<typeof ChatResponseSchema>

/* ------------------------------------------------------------------ agent */

/** One run phase (`research` / `build` / `review` / `shipped`). */
export const AgentPhaseSchema = z.object({
  status: str,
  tools: strArray,
  evidence_count: num,
  outcome: str,
  latency_ms: num,
  error: str,
})
export type AgentPhase = z.infer<typeof AgentPhaseSchema>

/** `POST|GET /agent/runs[/{id}]` — the full persisted run row. */
export const AgentRunSchema = z.object({
  id: num,
  goal: str,
  status: str,
  phases: z.record(z.string(), AgentPhaseSchema).catch({}),
  tool_calls: z.array(ToolCallSchema).catch([]),
  evidence: z.array(record).catch([]),
  answer: str,
  /** The provider/model that actually ran (`''` on a rule-only run). */
  provider: str,
  model: str,
  /** What the caller *asked* for (`''` when no override was sent). */
  requested_provider: str,
  requested_model: str,
  turns: num,
  latency_ms: num,
  outcome: str,
  feedback_score: nullableNum,
  error: str,
  mode: str,
  created_by: str,
  created_at: str,
  finished_at: z.string().nullish().catch(null),
})
export type AgentRun = z.infer<typeof AgentRunSchema>

/** `POST /agent/runs/{id}/feedback` — thumbs score + learn outcome. */
export const FeedbackSchema = z.object({
  run_id: num,
  feedback_score: num,
  run: AgentRunSchema,
  learn: record,
})
export type FeedbackResult = z.infer<typeof FeedbackSchema>

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