import { useState, type FormEvent } from 'react'
import { Info, ScanText, Sparkles, Tags } from 'lucide-react'
import { useAnalyzeParagraph, useAnalyzeSentence } from '../features/analyze/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { Metric } from '../components/StatTile'
import type { ParagraphAnalysis, SentenceAnalysis } from '../lib/schemas'
import { isNonEmptyArray, isNonEmptyRecord } from '../lib/format'

const SAMPLES = [
  'Pasian in leitung a piangsak hi.',
  'Pasian in amaute thupha a pia hi.',
  'Gam ka mu hi.',
  'Ka pai kei ding.',
  'Bang hang pai na hiam?',
]

export function Analyze() {
  const [text, setText] = useState(SAMPLES[0])
  const sentence = useAnalyzeSentence()
  const paragraph = useAnalyzeParagraph()

  const runSentence = () => {
    if (text.trim()) sentence.mutate(text.trim())
  }
  const runParagraph = () => {
    if (text.trim()) paragraph.mutate(text.trim())
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    runSentence()
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-50">
          <ScanText className="size-5 text-emerald-400" aria-hidden />
          Analyze text
        </h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          Sentence tokenisation and paragraph segmentation against the live Zolai tokenizer. The API
          is the authority on what exists; panels that are not yet populated say so.
        </p>
      </header>

      <Card title="Input" subtitle="POST /analyze/sentence · POST /analyze/paragraph">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label htmlFor="analyze-text" className="text-xs font-medium text-slate-300">
            Zolai text
          </label>
          <textarea
            id="analyze-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="Pasian in leitung a piangsak hi."
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />

          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setText(sample)}
                className="rounded-md border border-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
              >
                {sample}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!text.trim() || sentence.isPending}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sentence.isPending ? 'Analyzing…' : 'Analyze sentence'}
            </button>
            <button
              type="button"
              onClick={runParagraph}
              disabled={!text.trim() || paragraph.isPending}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {paragraph.isPending ? 'Segmenting…' : 'Analyze paragraph'}
            </button>
            {(sentence.isSuccess || paragraph.isSuccess) && (
              <button
                type="button"
                onClick={() => {
                  sentence.reset()
                  paragraph.reset()
                }}
                className="rounded-lg px-3 py-2 text-xs text-slate-500 transition hover:text-slate-300"
              >
                Clear results
              </button>
            )}
          </div>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Sentence analysis"
          subtitle="POST /analyze/sentence"
          actions={<Tags className="size-4 text-slate-600" aria-hidden />}
        >
          {sentence.isPending ? (
            <SkeletonLines />
          ) : sentence.isError ? (
            <ErrorState error={sentence.error} compact />
          ) : !sentence.data ? (
            <Empty
              title="No result yet"
              hint="Run a sentence analysis to see the tokeniser output for the text above."
            />
          ) : (
            <SentenceResult data={sentence.data} />
          )}
        </Card>

        <Card
          title="Paragraph analysis"
          subtitle="POST /analyze/paragraph"
          actions={<Sparkles className="size-4 text-slate-600" aria-hidden />}
        >
          {paragraph.isPending ? (
            <SkeletonLines />
          ) : paragraph.isError ? (
            <ErrorState error={paragraph.error} compact />
          ) : !paragraph.data ? (
            <Empty
              title="No result yet"
              hint="Run a paragraph analysis to see sentence segmentation."
            />
          ) : (
            <ParagraphResult data={paragraph.data} />
          )}
        </Card>
      </div>
    </div>
  )
}

function SentenceResult({ data }: { data: SentenceAnalysis }) {
  const hasPos = isNonEmptyArray(data.pos)
  const hasGrammar = isNonEmptyArray(data.grammar)
  const hasEntities = isNonEmptyArray(data.entities)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Tokens" value={data.tokens.length} />
        <Metric label="POS tags" value={hasPos ? data.pos.length : '—'} hint={hasPos ? undefined : 'not populated'} />
        <Metric
          label="Grammar"
          value={hasGrammar ? data.grammar.length : '—'}
          hint={hasGrammar ? undefined : 'not populated'}
        />
        <Metric
          label="Entities"
          value={hasEntities ? data.entities.length : '—'}
          hint={hasEntities ? undefined : 'not populated'}
        />
      </div>

      <section>
        <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Tokens</h3>
        {data.tokens.length === 0 ? (
          <Empty compact title="No tokens" hint="The tokeniser returned an empty list for this input." />
        ) : (
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {data.tokens.map((token, index) => (
              <li
                key={`${token}-${index}`}
                className="flex items-baseline gap-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1"
              >
                <span className="font-mono text-sm text-emerald-200">{token}</span>
                <span className="text-[10px] text-slate-600 tabular-nums">{index}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Verified gap: the live API returns pos/grammar/entities as [] today. */}
      {!hasPos && !hasGrammar && !hasEntities && (
        <p className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs leading-relaxed text-slate-400">
          <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
          <span>
            The live deployment returns <span className="font-mono">pos</span>,{' '}
            <span className="font-mono">grammar</span> and <span className="font-mono">entities</span> as
            empty arrays. Tagging is planned behind the discovery pipeline — this panel will fill in
            automatically once it lands.
          </span>
        </p>
      )}

      <RawJson data={data} label="raw /analyze/sentence" />
    </div>
  )
}

function ParagraphResult({ data }: { data: ParagraphAnalysis }) {
  const analysis = data.analysis
  const tokensPerSentence = Array.isArray(analysis.tokens_per_sentence)
    ? (analysis.tokens_per_sentence as unknown[]).map((n) => (typeof n === 'number' ? n : 0))
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Sentences" value={data.sentences.length} />
        <Metric
          label="Tokens/sentence"
          value={
            tokensPerSentence.length === 0
              ? '—'
              : tokensPerSentence.reduce((a, b) => a + b, 0) / tokensPerSentence.length
          }
          hint={tokensPerSentence.length === 0 ? 'not reported' : 'mean'}
        />
        <Metric label="Status" value={String(analysis.status ?? '—')} />
        <Metric label="Depth" value={isNonEmptyRecord(analysis) ? 'thin' : 'empty'} />
      </div>

      <section>
        <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Sentences</h3>
        {data.sentences.length === 0 ? (
          <Empty compact title="No sentences" hint="Segmentation returned an empty list." />
        ) : (
          <ol className="mt-2 flex flex-col gap-1.5">
            {data.sentences.map((sentence, index) => (
              <li
                key={index}
                className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <span className="text-[10px] text-slate-600 tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-slate-200">
                  {sentence}
                </span>
                {tokensPerSentence[index] !== undefined && (
                  <span className="shrink-0 font-mono text-[10px] text-slate-600">
                    {tokensPerSentence[index]} tok
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {typeof analysis.note === 'string' && analysis.note && (
        <p className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs leading-relaxed text-slate-400">
          <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
          <span>
            Server note: <span className="font-mono text-slate-300">{analysis.note}</span>
          </span>
        </p>
      )}

      <RawJson data={data} label="raw /analyze/paragraph" />
    </div>
  )
}

function SkeletonLines() {
  return (
    <div className="space-y-2.5" aria-busy="true">
      {[92, 78, 84, 60].map((width) => (
        <div
          key={width}
          className="animate-pulse-soft h-3 rounded bg-slate-800"
          style={{ width: `${width}%` }}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
