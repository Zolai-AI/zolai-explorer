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
  uptime_s: num,
  /**
   * Live deployment reports these; absent older payloads fall back safely.
   * `data_root` is gone: the public `/health` dropped the container path
   * (core#16), and a schema field that can never be true only invites the UI
   * to render an empty row for it.
   */
  engine_mode: str,
  llm_allowed: bool,
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
 * router, so the curation panel says *"not exposed on this deployment"* on a
 * 404 — an explicit state, not a silent absence and not a zeroed chart.
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

/** One neighbour from `GET /word/{w}/related`. */
export const RelatedWordSchema = z.object({
  word: str,
  pos: z.string().nullish().catch(null),
  frequency: num,
  relation: str,
  shared_prefix: num,
})
export type RelatedWord = z.infer<typeof RelatedWordSchema>

export const WordRelatedSchema = z.object({
  word: str,
  related: z.array(RelatedWordSchema).catch([]),
})
export type WordRelated = z.infer<typeof WordRelatedSchema>

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
  // The row's own content, when the source table publishes one. Without it a
  // citation is just the headword, which is not citable evidence of anything.
  definition: z.string().optional(),
})
export type Citation = z.infer<typeof CitationSchema>

export const RagSchema = z.object({
  question: str,
  context: str,
  citations: z.array(CitationSchema).catch([]),
  answer: str,
  retrieved_count: num,
  /**
   * True when a model wrote `answer`. The server sends these so the UI never has
   * to infer provenance by pattern-matching prose — an older server omits them
   * and falls back to the conservative reading below.
   */
  generated: z.boolean().catch(false),
  retrieval_only: z.boolean().catch(true),
  provider: z.string().catch(''),
  model: z.string().catch(''),
  provider_error: z.string().catch(''),
})
export type RagResult = z.infer<typeof RagSchema>

/* ------------------------------------------------------------------ auth */

/**
 * The role vocabulary as `zolai.api.rbac.ROLES` serves it, least → greatest.
 * `superadmin` is the fourth value the 4-role model added (it is what
 * `role:manage` makes a credential); `role` gains it rather than replacing one,
 * so every role enum below keeps its `.catch()` on the *lowest* value — an
 * unrecognised answer degrades to the least-privileged reading instead of
 * failing the gate.
 */
export const ROLE_VALUES = ['anonymous', 'member', 'admin', 'superadmin'] as const

/** Roles a stored account can hold (`VALID_ROLES`) — `anonymous` is never a row. */
export const ACCOUNT_ROLE_VALUES = ['member', 'admin', 'superadmin'] as const

/** Roles an account may *ask* for (`REQUESTABLE_ROLES`) — nobody asks to be a member. */
export const REQUESTABLE_ROLE_VALUES = ['admin', 'superadmin'] as const

/** An account row's role — every `Role` except the one that is not a row. */
export type AccountRole = (typeof ACCOUNT_ROLE_VALUES)[number]
/** The two roles the request queue can hand out. */
export type RequestableRole = (typeof REQUESTABLE_ROLE_VALUES)[number]

/**
 * `auth_source` as the **server** spells it: which credential it actually
 * resolved. This is the wire contract, not the client's own vocabulary —
 * `credentials.ts` says `session | api-key | none` about which *header this
 * browser sends*, with a hyphen and a different word for "nothing". Keeping the
 * two apart matters: `api_key` is underscored, `anonymous` is the server's word
 * for "no credential accepted" (it is not `none`), and `oauth` is a fourth
 * source a client that only knew about keys would have misread.
 */
export const AUTH_SOURCE_VALUES = ['anonymous', 'api_key', 'session', 'oauth'] as const
export type MeAuthSource = (typeof AUTH_SOURCE_VALUES)[number]

/**
 * The tolerant role field: a value this build does not know reads as the
 * **lowest** privilege rather than throwing, which is why one object owns it
 * instead of each schema re-spelling the fallback.
 */
export const RoleSchema = z.enum(ROLE_VALUES).catch('anonymous')

/**
 * `GET /auth/me` — public identity probe. When the caller authenticated with a
 * username session the payload also carries `username` (and, server-side,
 * `display_name` / `user_id` / `expires_at`); `key_prefix` stays `null` because a
 * session has no prefix.
 */
export const AuthMeSchema = z.object({
  role: RoleSchema,
  key_prefix: z.string().nullish().catch(null),
  scopes: strArray,
  mode: str,
  // Additive fields (tolerant): may be added by the server without breaking clients.
  username: z.string().nullish().catch(null),
  // `.catch('anonymous')`, not `api_key`: a source this build cannot read must
  // never read as "a key worked".
  auth_source: z.enum(AUTH_SOURCE_VALUES).catch('anonymous'),
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
  role: RoleSchema,
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
 *
 * There is deliberately **no `user_provider`**: the client never names a
 * vendor. A pasted key travels as `api_key` and is applied by the server to
 * the catalog row named by `provider`.
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
  role: z.enum(ACCOUNT_ROLE_VALUES).catch('member'),
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

/* ----------------------------------------------------------- role requests */

/** The `role_requests.status` domain (`ROLE_REQUEST_STATUSES` in zolai-core). */
export const ROLE_REQUEST_STATUS_VALUES = ['pending', 'approved', 'rejected'] as const

/** One queue state — the filter adds `all`, which is a query, not a row. */
export type RoleRequestStatus = (typeof ROLE_REQUEST_STATUS_VALUES)[number]

/**
 * One ask in the queue, as every role-request route serves it.
 *
 * The row carries `username` and `user_id` **by design**: the queue exists for
 * the decider to read. `/mine` cannot be pointed at another account — the
 * server filters on the `user_id` the session proves, so there is no identity
 * parameter for this UI to get wrong. Timestamps are the canonical UTC ISO
 * strings from `zolai.shared.clock.stamp`; `decided_by` / `decided_at` / `note`
 * are `null` while an ask is pending.
 */
export const RoleRequestSchema = z.object({
  id: num,
  user_id: num,
  username: str,
  /** Verbatim: the server only ever writes `admin` or `superadmin` here. */
  requested_role: str,
  reason: str,
  status: z.enum(ROLE_REQUEST_STATUS_VALUES).catch('pending'),
  created_at: str,
  decided_by: z.string().nullish().catch(null),
  decided_at: z.string().nullish().catch(null),
  note: z.string().nullish().catch(null),
})
export type RoleRequest = z.infer<typeof RoleRequestSchema>

/** `GET /role-requests/mine` — `{items, count}`, newest first. */
export const RoleRequestListSchema = z.object({
  items: z.array(RoleRequestSchema).catch([]),
  count: num,
})
export type RoleRequestList = z.infer<typeof RoleRequestListSchema>

/** `GET /role-requests` (the queue) — the same list plus the resolved filter. */
export const RoleRequestQueueSchema = RoleRequestListSchema.extend({
  status: z.enum([...ROLE_REQUEST_STATUS_VALUES, 'all']).catch('all'),
})
export type RoleRequestQueue = z.infer<typeof RoleRequestQueueSchema>

/**
 * `POST /role-requests` body.
 *
 * The `reason` is tolerant because an empty one is a refusal the server states
 * itself (it enforces 10–1000 characters); the `requested_role` is not, because
 * there is no value to fall back to that would not be a privilege guess. The
 * form validates both before enabling submit.
 */
export const RoleRequestInputSchema = z.object({
  // No `.catch()` here, unlike the read schemas: a role this client cannot name
  // must not be sent at all, and defaulting it to `admin` would invent a
  // privilege out of a parse failure.
  requested_role: z.enum(REQUESTABLE_ROLE_VALUES),
  reason: z.string().trim().max(1000).catch(''),
})
export type RoleRequestInput = z.infer<typeof RoleRequestInputSchema>

/** `POST /role-requests` → 201 `{request, message}`. */
export const RoleRequestCreatedSchema = z.object({
  request: RoleRequestSchema,
  message: str,
})
export type RoleRequestCreated = z.infer<typeof RoleRequestCreatedSchema>

/**
 * `POST /role-requests/{id}/decision` → `{request, user, message}`.
 * `user` is the promoted account (`sanitize_user`, so no hash) — `null` on a
 * rejection, because no row changed.
 */
export const RoleRequestDecisionSchema = z.object({
  request: RoleRequestSchema,
  user: AdminUserSchema.nullish().catch(null),
  message: str,
})
export type RoleRequestDecision = z.infer<typeof RoleRequestDecisionSchema>

/** `POST /role-requests/{id}/decision` body — `decision` is one of two words. */
export const RoleDecisionInputSchema = z.object({
  // No `.catch()`, same reasoning as `requested_role`: a decision this client
  // could not read must not silently become one on the applicant's behalf.
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).catch(''),
})
export type RoleDecisionInput = z.infer<typeof RoleDecisionInputSchema>

/* ---------------------------------------------------------- contributions */

/**
 * One row of `GET /contributions/mine`.
 *
 * The projection is fixed **server-side** (`MINE_COLUMNS`) and has no `email`:
 * an address offered for editorial contact is not this route's to give away, so
 * the absence here is a privacy property, not a field nobody got round to.
 */
export const MyContributionSchema = z.object({
  id: num,
  type: str,
  word: str,
  field: str,
  /** Review state, verbatim — the editorial queue owns its vocabulary. */
  status: str,
  created_at: str,
  reviewed_at: z.string().nullish().catch(null),
  reviewed_by: z.string().nullish().catch(null),
})
export type MyContribution = z.infer<typeof MyContributionSchema>

export const MyContributionListSchema = z.object({
  items: z.array(MyContributionSchema).catch([]),
  count: num,
})
export type MyContributionList = z.infer<typeof MyContributionListSchema>

/**
 * `POST /contributions` response (`ContributionOut`). `attributed_to` is the
 * username or key label the server derived from the resolved credential —
 * `null` for an anonymous submission, which is the honest "nobody is credited"
 * state and not an error. The client never sends an identity field.
 */
export const ContributionReceiptSchema = z.object({
  id: num,
  status: str,
  message: str,
  attributed_to: z.string().nullish().catch(null),
})
export type ContributionReceipt = z.infer<typeof ContributionReceiptSchema>

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
  /**
   * The handler's payload — a **list** for `rag_search` (rows), a **dict** for
   * `dictionary_lookup`/`verse_lookup`. Typing this as `record` silently
   * collapsed every list to `{}`, so the trace could never show what a search
   * actually returned.
   */
  data: z.unknown(),
  error: str,
  /** Stable failure class from the server (`invalid_argument`, `timeout`, …). */
  error_code: str,
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
  /** Whether the caller provided a per-request API key. */
  requested_api_key: bool,
  /** Whether the caller provided a per-request user provider override. */
  requested_user_provider: bool,
  mode: str,
  retrieval_only: bool,
  /**
   * The public route pinned this request to retrieval because it carried no
   * credential. Distinct from a deployment with no provider: when true,
   * signing in is what generation was missing, so the UI must say so instead
   * of "no active provider".
   */
  generation_requires_auth: bool,
  latency_ms: num,
  zvs: record,
  provider_error: str,
  loop_error: str,
  persisted_run_id: nullableNum,
})
export type ChatResponse = z.infer<typeof ChatResponseSchema>

/**
 * PATCH /api/v1/review/records/{table}/{id} response.
 */
export const CorrectionResponseSchema = z.object({
  table: str,
  id: num,
  updated_fields: strArray,
  review_status: z.string().nullish().catch(null),
  audit_rows: num,
})
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>

/* ------------------------------------------------------------------ agent */

/** One run phase (`research` / `build` / `review` / `shipped`). */
export const AgentPhaseSchema = z.object({
  status: str,
  tools: strArray,
  // A phase that recorded nothing reports *absent*, not zero — `num`'s
  // `.catch(0)` would fabricate "0 evidence" on the chip. `nullableNum` is the
  // same tolerant pattern (never throws) that lets display render `—`.
  evidence_count: nullableNum,
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

/* --------------------------------------------------------- learning agents */

/**
 * `config` on a learning agent — the tuning block `PATCH /learning/agents/{id}`
 * edits field-for-field. Every field is nullable: a deployment that seeds an
 * agent without a threshold sends nothing, and "no threshold" must not read as
 * `0` (which the UI would render as "confidence 0%").
 */
export const LearningAgentConfigSchema = z
  .object({
    confidence_threshold: nullableNum,
    learning_rate: nullableNum,
    bible_priority: z.boolean().nullish().catch(null),
  })
  .catch({ confidence_threshold: null, learning_rate: null, bible_priority: null })
export type LearningAgentConfig = z.infer<typeof LearningAgentConfigSchema>

/** One row of `GET /learning/agents` and `GET /learning/overview`. */
export const LearningAgentSchema = z.object({
  agent_id: str,
  name: str,
  role: str,
  skills: strArray,
  enabled: bool,
  config: LearningAgentConfigSchema,
  created_at: str,
  updated_at: str,
})
export type LearningAgent = z.infer<typeof LearningAgentSchema>

export const LearningAgentsSchema = z.object({
  agents: z.array(LearningAgentSchema).catch([]),
})
export type LearningAgents = z.infer<typeof LearningAgentsSchema>

/**
 * `GET /learning/overview` — counts plus the role histogram.
 *
 * The response also inlines `agents` and `seeded_defaults`; both are read
 * tolerantly because an older build may omit them, and the page treats the
 * roster as "the agents route answered" rather than "the overview did".
 */
export const LearningOverviewSchema = z.object({
  agents_total: num,
  agents_enabled: num,
  agents_disabled: num,
  skills_total: num,
  roles: z.record(z.string(), z.number()).catch({}),
  seeded_defaults: strArray,
  agents: z.array(LearningAgentSchema).catch([]),
})
export type LearningOverview = z.infer<typeof LearningOverviewSchema>

/** One row of `GET /learning/skills`. */
export const LearningSkillSchema = z.object({
  skill_id: str,
  name: str,
  description: str,
  category: str,
  config_schema: record,
  enabled: bool,
  created_at: str,
})
export type LearningSkill = z.infer<typeof LearningSkillSchema>

export const LearningSkillsSchema = z.object({
  skills: z.array(LearningSkillSchema).catch([]),
})
export type LearningSkills = z.infer<typeof LearningSkillsSchema>

/** The agent reference an assistant carries — id, role and enabled flag. */
export const LearningAssistantAgentSchema = z.object({
  agent_id: str,
  role: str,
  enabled: bool,
})
export type LearningAssistantAgent = z.infer<typeof LearningAssistantAgentSchema>

/**
 * One row of `GET /learning/assistants`.
 *
 * `enabled_agents` is a **count or a list** depending on the server build, so
 * it is read as a union and normalised by `enabledAgentCount` in the feature
 * module — the page needs the number, not the shape.
 */
export const LearningAssistantSchema = z.object({
  assistant_id: str,
  agents: z.array(LearningAssistantAgentSchema).catch([]),
  enabled_agents: z.union([z.array(z.string()), z.number()]).catch(0),
})
export type LearningAssistant = z.infer<typeof LearningAssistantSchema>

export const LearningAssistantsSchema = z.object({
  assistants: z.array(LearningAssistantSchema).catch([]),
})
export type LearningAssistants = z.infer<typeof LearningAssistantsSchema>

/** One row of `GET /learning/bindings` — the binding joined to its agent. */
export const LearningBindingSchema = z.object({
  assistant_id: str,
  agent_id: str,
  role: str,
  enabled: bool,
  agent_name: str,
  agent_role: str,
  agent_enabled: bool,
  confidence_threshold: nullableNum,
  skills: strArray,
})
export type LearningBinding = z.infer<typeof LearningBindingSchema>

export const LearningBindingsSchema = z.object({
  bindings: z.array(LearningBindingSchema).catch([]),
})
export type LearningBindings = z.infer<typeof LearningBindingsSchema>

/**
 * `POST /learning/run` — `{task, result, limit_applied, limit_clamped}`.
 *
 * `result` is deliberately a free record: the shape is **per task**
 * (`{translation}` for translate, `{corrected}` for correct_grammar,
 * `{patterns}` / `{entries}` for the corpus tasks), and a schema that pinned one
 * of them would silently drop the other five. The panel renders the fields a
 * task is known to carry and falls back to the raw record below it.
 */
export const LearningRunSchema = z.object({
  task: str,
  result: record,
  limit_applied: num,
  limit_clamped: bool,
})
export type LearningRun = z.infer<typeof LearningRunSchema>

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