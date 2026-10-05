import { describe, expect, it } from 'vitest'
import {
  AgentRunSchema,
  ChatResponseSchema,
  FeedbackSchema,
  HealthSchema,
  KnowledgeVersionSchema,
  ParagraphAnalysisSchema,
  ProviderListSchema,
  ProviderSchema,
  ProviderTestSchema,
  RagSchema,
  SearchSchema,
  SentenceAnalysisSchema,
  StatisticsSchema,
  WordCollocationsSchema,
  WordContextSchema,
  WordContextsSchema,
  WordEvidenceSchema,
  WordFormsSchema,
  WordPatternsSchema,
  WordSchema,
  parseOrThrow,
} from './schemas'

/**
 * Payloads below are trimmed verbatim from the LIVE API at
 * https://api.zolai.space (verified during this build), including the real
 * "empty" shapes that the UI has to survive.
 */

describe('health', () => {
  it('parses the live /health payload', () => {
    const parsed = HealthSchema.parse({
      status: 'ok',
      version: '1.0.0',
      data_root: '/app/data',
      uptime_s: 607.545,
    })
    expect(parsed.status).toBe('ok')
    expect(parsed.uptime_s).toBeCloseTo(607.545)
  })

  it('falls back rather than throwing when fields are missing', () => {
    const parsed = HealthSchema.parse({})
    expect(parsed.status).toBe('')
    expect(parsed.uptime_s).toBe(0)
  })
})

describe('statistics + version', () => {
  it('parses the live /knowledge/statistics payload', () => {
    const parsed = StatisticsSchema.parse({
      stats: {
        'dictionary entries': 84490,
        'EN→ZO entries': 64025,
        'Bible verses': 31102,
        'vocabulary items': 104906,
        'phrases': 10722,
        'grammar patterns': 6063,
        collocations: 5000,
        'knowledge claims': 172,
        hypotheses: 612,
        evidence: 1751,
        'KG nodes': 2,
        'KG edges': 1,
      },
    })
    expect(parsed.stats['dictionary entries']).toBe(84490)
    expect(parsed.stats['Bible verses']).toBe(31102)
    expect(Object.keys(parsed.stats)).toHaveLength(12)
  })

  it('parses the live /knowledge/version payload', () => {
    const parsed = KnowledgeVersionSchema.parse({
      version: 'v2026.10.0-new-v85474',
      git_commit: '397dc5eec1bb',
      created_at: '2026-10-03T11:34:46.710540+00:00',
    })
    expect(parsed.git_commit).toHaveLength(12)
  })

  it('collapses a missing stats object to {}', () => {
    expect(StatisticsSchema.parse({}).stats).toEqual({})
  })
})

describe('word', () => {
  const liveWord = {
    word: 'pasian',
    forms: [],
    frequency: 5223,
    document_frequency: 64,
    sentence_frequency: 0,
    pos: ['Noun', 'NOUN'],
    morphology: {},
    examples: ['God', 'KG node: pasian (word)', 'Freq: 5123'],
    collocations: [
      { word1: 'pasian', word2: 'sangpen', pmi: 6.493, freq: 14 },
      { word1: 'pasian', word2: 'singkuang', pmi: 5.173, freq: 48 },
    ],
    grammar_usage: [],
    sources: ['dictionary', 'kg_nodes', 'word_observation_stats'],
    confidence: 0.86,
  }

  it('parses the live /word/pasian payload including its empty sections', () => {
    const parsed = WordSchema.parse(liveWord)
    expect(parsed.word).toBe('pasian')
    expect(parsed.frequency).toBe(5223)
    // Live gaps the UI must handle without rendering a broken panel:
    expect(parsed.forms).toEqual([])
    expect(parsed.sentence_frequency).toBe(0)
    expect(parsed.morphology).toEqual({})
    expect(parsed.grammar_usage).toEqual([])
    expect(parsed.confidence).toBe(0.86)
  })

  it('parses the live all-zero "unknown word" payload without error', () => {
    const parsed = WordSchema.parse({
      word: 'zzzznotaword',
      forms: [],
      frequency: 0,
      document_frequency: 0,
      sentence_frequency: 0,
      pos: [],
      morphology: {},
      examples: [],
      collocations: [],
      grammar_usage: [],
      sources: [],
      confidence: 0,
    })
    expect(parsed.frequency).toBe(0)
    expect(parsed.sources).toEqual([])
  })

  it('defaults every missing field so a sparse payload still renders', () => {
    const parsed = WordSchema.parse({ word: 'gam' })
    expect(parsed.forms).toEqual([])
    expect(parsed.collocations).toEqual([])
    expect(parsed.examples).toEqual([])
    expect(parsed.morphology).toEqual({})
    expect(parsed.confidence).toBe(0)
  })

  it('parses /word/{w}/forms', () => {
    const parsed = WordFormsSchema.parse({
      word: 'pasian',
      forms: ['pasian', 'pasian-a', 'pasian-in'],
    })
    expect(parsed.forms).toHaveLength(3)
  })

  it('parses /word/{w}/contexts with parallel Bible columns', () => {
    const parsed = WordContextsSchema.parse({
      word: 'pasian',
      contexts: [
        {
          source: 'bible_verses',
          ref: '1CH 4:10',
          en: 'And Jabez called on the God of Israel',
          zo_tdb77: 'Jabez in Israel Pasian tungah thu ngen a',
          zo_tedim2010: 'Jabez in Israel Pasian tungah thu ngen a',
        },
      ],
    })
    expect(parsed.contexts[0].ref).toBe('1CH 4:10')
  })

  it('tolerates a context row with only a reference', () => {
    const parsed = WordContextsSchema.parse({
      word: 'pasian',
      contexts: [{ ref: 'GEN 1:1' }],
    })
    const row: unknown = parsed.contexts[0]
    expect(WordContextSchema.safeParse(row).success).toBe(true)
    expect(parsed.contexts[0].zo_tdb77).toBe('')
  })

  it('parses /word/{w}/collocations, which uses `frequency` not `freq`', () => {
    const parsed = WordCollocationsSchema.parse({
      word: 'pasian',
      collocations: [{ word1: 'pasian', word2: 'hong', frequency: 253, pmi: 0 }],
    })
    expect(parsed.collocations[0].frequency).toBe(253)
  })

  it('parses /word/{w}/patterns with a null confidence', () => {
    const parsed = WordPatternsSchema.parse({
      word: 'pasian',
      patterns: [
        {
          pattern_id: 'pat_7427d3bd',
          pattern: 'ciangin-Pasian',
          description: '',
          function: '',
          examples: ['1CH 4:10', '1CH 13:10'],
          confidence: null,
          status: 'OBSERVED',
        },
      ],
    })
    expect(parsed.patterns[0].confidence).toBeNull()
    expect(parsed.patterns[0].status).toBe('OBSERVED')
  })

  it('parses /word/{w}/evidence including nested metadata', () => {
    const parsed = WordEvidenceSchema.parse({
      word: 'pasian',
      evidence: [
        {
          source_type: 'dictionary',
          source: 'dictionary',
          tier: 2,
          confidence: 0.9,
          text: 'God',
          metadata: { word: 'pasian', definition: 'God', pos: null, frequency: 0 },
        },
      ],
    })
    expect(parsed.evidence[0].tier).toBe(2)
    expect(parsed.evidence[0].metadata).toMatchObject({ definition: 'God' })
  })

  it('collapses missing sub-resource arrays to []', () => {
    expect(WordFormsSchema.parse({ word: 'x' }).forms).toEqual([])
    expect(WordContextsSchema.parse({ word: 'x' }).contexts).toEqual([])
    expect(WordCollocationsSchema.parse({ word: 'x' }).collocations).toEqual([])
    expect(WordPatternsSchema.parse({ word: 'x' }).patterns).toEqual([])
    expect(WordEvidenceSchema.parse({ word: 'x' }).evidence).toEqual([])
  })
})

describe('analyze', () => {
  it('parses the live /analyze/sentence payload with empty pos/grammar/entities', () => {
    const parsed = SentenceAnalysisSchema.parse({
      text: 'Pasian in leitung a piangsak hi.',
      tokens: ['pasian', 'in', 'leitung', 'a', 'piangsak', 'hi'],
      pos: [],
      grammar: [],
      entities: [],
    })
    expect(parsed.tokens).toHaveLength(6)
    // Documented gap: these are not populated by the live API yet.
    expect(parsed.pos).toEqual([])
    expect(parsed.grammar).toEqual([])
    expect(parsed.entities).toEqual([])
  })

  it('parses the live thin /analyze/paragraph analysis block', () => {
    const parsed = ParagraphAnalysisSchema.parse({
      text: 'Pasian om hi. Gam ka mu hi.',
      sentences: ['Pasian om hi. Gam ka mu hi.'],
      analysis: {
        status: 'tokenized',
        note: 'segmentation complete; POS/grammar via discovery pipeline',
        tokens_per_sentence: [7],
      },
    })
    expect(parsed.sentences).toHaveLength(1)
    expect(parsed.analysis.status).toBe('tokenized')
  })
})

describe('search', () => {
  it('parses the live /search payload', () => {
    const parsed = SearchSchema.parse({
      query: 'pasian',
      results: [
        {
          id: 'bible_verses:1CH 4:10',
          text: 'Jabez in Israel Pasian tungah thu ngen a',
          score: 1,
          source: 'bible_verses',
          metadata: {},
        },
      ],
    })
    expect(parsed.results[0].source).toBe('bible_verses')
    expect(parsed.results[0].metadata).toEqual({})
  })

  it('collapses an empty result set to []', () => {
    expect(SearchSchema.parse({ query: 'zzz', results: [] }).results).toEqual([])
    expect(SearchSchema.parse({ query: 'zzz' }).results).toEqual([])
  })
})

describe('rag', () => {
  it('parses the live /rag payload with the placeholder answer', () => {
    const parsed = RagSchema.parse({
      question: 'gam',
      context: '[1] bible_verses: ...',
      citations: [{ id: 1, source: 'bible_verses', text: 'Eber sung pan a piang' }],
      answer: 'Based on 10 sources: [1] bible_verses: ...',
      retrieved_count: 10,
    })
    expect(parsed.retrieved_count).toBe(10)
    expect(parsed.citations).toHaveLength(1)
    expect(parsed.citations[0].source).toBe('bible_verses')
  })

  it('parses a zero-retrieval response', () => {
    const parsed = RagSchema.parse({
      question: 'What did God create?',
      context: '',
      citations: [],
      answer: 'Based on 0 sources: ...',
      retrieved_count: 0,
    })
    expect(parsed.retrieved_count).toBe(0)
    expect(parsed.context).toBe('')
  })

  it('tolerates a citation without a usable id', () => {
    const parsed = RagSchema.parse({
      question: 'q',
      context: '',
      citations: [{ source: 'dictionary', text: 'x' }],
      answer: 'a',
      retrieved_count: 1,
    })
    expect(parsed.citations[0].id).toBe(0)
  })
})

describe('parseOrThrow', () => {
  it('returns typed data on success', () => {
    expect(parseOrThrow(HealthSchema, { status: 'ok' }, 'health').status).toBe('ok')
  })

  it('throws a readable message naming the endpoint', () => {
    expect(() => parseOrThrow(StatisticsSchema, 'not-an-object', 'statistics')).toThrow(
      /Unexpected statistics payload/,
    )
  })

  it('rescues a wrongly-typed nested field instead of failing the whole payload', () => {
    // `stats` is deliberately tolerant: a bad value degrades to {} so the
    // dashboard renders an empty state rather than an error wall.
    expect(parseOrThrow(StatisticsSchema, { stats: 'not-an-object' }, 'statistics').stats).toEqual({})
  })
})

/** Trimmed from the deployed `/admin/ai-providers` contract (ADR-014). */
const PROVIDER_ROW = {
  catalog_id: 'pcore-brain',
  name: 'P-Core Brain',
  adapter: 'brain',
  base_url: 'https://pcore-brain.peterlianpi.site/v1',
  models: ['free-1', 'free-2'],
  selected_model: 'free-1',
  docs: '',
  requires_key: true,
  enabled: true,
  is_active: true,
  tier: 'free',
  timeout_s: 45,
  secret: { mode: 'env', ref_masked: '***BRIDGE_KEY', configured: true },
}

describe('ai provider catalog', () => {
  it('parses a catalog row, including the masked secret view', () => {
    const parsed = ProviderSchema.parse(PROVIDER_ROW)
    expect(parsed.catalog_id).toBe('pcore-brain')
    expect(parsed.adapter).toBe('brain')
    expect(parsed.secret.configured).toBe(true)
    // The mask is the only secret material a row may carry.
    expect(parsed.secret.ref_masked).not.toContain('key_')
  })

  it('never yields a plaintext secret — a bad mode degrades to none', () => {
    const parsed = ProviderSchema.parse({
      ...PROVIDER_ROW,
      secret: { mode: 'plaintext-oops', ref_masked: '', configured: false },
    })
    expect(parsed.secret.mode).toBe('none')
    expect(parsed.secret.configured).toBe(false)
  })

  it('degrades a partial row instead of rejecting the whole catalog', () => {
    const parsed = ProviderListSchema.parse({ items: [PROVIDER_ROW, { name: 'half' }], count: 2 })
    expect(parsed.count).toBe(2)
    expect(parsed.items[0].catalog_id).toBe('pcore-brain')
    expect(parsed.items[1].catalog_id).toBe('')
    expect(parsed.items[1].models).toEqual([])
  })

  it('reads a test probe result with a null status on failure', () => {
    const parsed = ProviderTestSchema.parse({
      catalog_id: 'pcore-brain',
      ok: false,
      status: null,
      latency_ms: 12,
      error: 'no credential',
      model: null,
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.status).toBeNull()
    expect(parsed.error).toBe('no credential')
  })
})

describe('assistant chat response', () => {
  it('parses a retrieval-only answer and labels it as such', () => {
    const parsed = ChatResponseSchema.parse({
      answer: 'pasian = God',
      citations: [{ source: 'dictionary', ref: 'pasian', text: 'God', score: 0.91 }],
      tool_calls: [],
      turns: 1,
      provider: '',
      model: '',
      mode: 'retrieval_only',
      retrieval_only: true,
      latency_ms: 8,
      zvs: {},
      provider_error: 'no credential',
      loop_error: '',
      persisted_run_id: null,
    })
    // The honesty contract: retrieval_only is preserved so the UI can refuse
    // to call the answer "generated".
    expect(parsed.retrieval_only).toBe(true)
    expect(parsed.citations[0].score).toBeCloseTo(0.91)
    expect(parsed.persisted_run_id).toBeNull()
  })

  it('collapses missing citations/tools to empty arrays, not errors', () => {
    const parsed = ChatResponseSchema.parse({ answer: 'hi', retrieval_only: false })
    expect(parsed.citations).toEqual([])
    expect(parsed.tool_calls).toEqual([])
    expect(parsed.retrieval_only).toBe(false)
  })

  it('keeps an absent persisted_run_id null-ish rather than a bogus id', () => {
    // `nullableNum`: absent → undefined, explicit null → null. Both are
    // falsy, which is all the UI needs to hide the "persisted" hint.
    const absent = ChatResponseSchema.parse({ answer: 'hi', persisted_run_id: undefined })
    const nullish = ChatResponseSchema.parse({ answer: 'hi', persisted_run_id: null })
    expect(absent.persisted_run_id ?? null).toBeNull()
    expect(nullish.persisted_run_id).toBeNull()
    expect(ChatResponseSchema.parse({ answer: 'hi', persisted_run_id: 3 }).persisted_run_id).toBe(3)
  })
})

describe('agent run', () => {
  const RUN_ROW = {
    id: 7,
    goal: 'audit ZVS forms in proverbs',
    status: 'succeeded',
    phases: {
      research: { status: 'ok', tools: ['kb_search'], evidence_count: 3, outcome: '', latency_ms: 40, error: '' },
    },
    tool_calls: [],
    evidence: [{ source: 'proverbs', ref: 'x' }],
    answer: 'done',
    provider: 'pcore-brain',
    model: 'free-1',
    turns: 3,
    latency_ms: 900,
    outcome: 'generated',
    feedback_score: null,
    error: '',
    mode: 'rule',
    created_by: 'key:zl_ab12',
    created_at: '2026-10-04T10:00:00Z',
    finished_at: null,
  }

  it('parses a finished run with its phase table', () => {
    const parsed = AgentRunSchema.parse(RUN_ROW)
    expect(parsed.id).toBe(7)
    expect(parsed.status).toBe('succeeded')
    expect(parsed.phases.research.status).toBe('ok')
    expect(parsed.phases.research.evidence_count).toBe(3)
    expect(parsed.feedback_score).toBeNull()
    expect(parsed.finished_at).toBeNull()
  })

  it('survives a run whose phases have not been written yet', () => {
    const parsed = AgentRunSchema.parse({ id: 8, goal: 'g', status: 'running' })
    expect(parsed.phases).toEqual({})
    expect(parsed.tool_calls).toEqual([])
    expect(parsed.evidence).toEqual([])
    // Not yet voted / not yet finished — both render as "no value".
    expect(parsed.feedback_score ?? null).toBeNull()
    expect(parsed.finished_at ?? null).toBeNull()
  })

  it('parses a feedback payload that carries the updated run', () => {
    const parsed = FeedbackSchema.parse({
      run_id: 7,
      feedback_score: 1,
      run: RUN_ROW,
      learn: { created_hypothesis_id: 12 },
    })
    expect(parsed.run_id).toBe(7)
    expect(parsed.feedback_score).toBe(1)
    expect(parsed.run.status).toBe('succeeded')
    expect(parsed.learn.created_hypothesis_id).toBe(12)
  })
})