import { useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  BookOpen,
  MessageSquareQuote,
  Quote,
  ScrollText,
  Sparkles,
} from 'lucide-react'
import { RAG_LIMITS, useRag } from '../features/rag/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { Metric } from '../components/StatTile'
import { formatCount } from '../lib/format'
import type { RagResult } from '../lib/schemas'

const SAMPLES = ['Pasian', 'gam', 'thupha', 'kei ding', 'bang hang pai na hiam']

/**
 * Honesty contract for this panel.
 *
 * The live deployment answers `/rag` from a **lexical placeholder**: it echoes
 * the retrieved snippets back as an "answer" string. No LLM is called (the
 * server holds a placeholder `GEMINI_API_KEY`). This banner is therefore a
 * permanent part of the panel, not a dismissible notice — the answer field must
 * never be presented as model-generated text.
 */
function PlaceholderNotice() {
  return (
    <div
      role="note"
      className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
      <div className="min-w-0 text-xs leading-relaxed text-amber-100">
        <p className="font-semibold text-amber-200">Placeholder answer — not LLM-generated</p>
        <p className="mt-1 text-amber-100/80">
          This deployment runs the lexical retrieval path only. The{' '}
          <span className="font-mono">answer</span> below is a template echo of the snippets it
          retrieved, and the server holds a placeholder{' '}
          <span className="font-mono">GEMINI_API_KEY</span> so no model is called. Treat the{' '}
          <span className="font-mono">context</span> and <span className="font-mono">citations</span>{' '}
          as the real output.
        </p>
      </div>
    </div>
  )
}

export function Rag() {
  const [question, setQuestion] = useState(SAMPLES[0])
  const [limit, setLimit] = useState<number>(RAG_LIMITS[1])
  const rag = useRag()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = question.trim()
    if (clean) rag.mutate({ question: clean, limit })
  }

  const data = rag.data
  const citations = data?.citations ?? []
  const answerIsPlaceholderEcho =
    !data || data.retrieved_count === 0 || data.answer.trim() === '' || /^Based on \d+ sources:/i.test(data.answer.trim())

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-50">
          <MessageSquareQuote className="size-5 text-emerald-400" aria-hidden />
          RAG retrieval
        </h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          Retrieval-augmented generation endpoint, shown honestly: the retrieved context and
          citations are real corpus data, the answer is a placeholder.
        </p>
      </header>

      <PlaceholderNotice />

      <Card title="Question" subtitle="POST /rag" actions={<Sparkles className="size-4 text-slate-600" aria-hidden />}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="rag-question" className="block text-xs font-medium text-slate-300">
                Question or Zolai query
              </label>
              <input
                id="rag-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Pasian"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="rag-limit" className="block text-xs font-medium text-slate-300">
                Limit
              </label>
              <select
                id="rag-limit"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="mt-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {RAG_LIMITS.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!question.trim() || rag.isPending}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {rag.isPending ? 'Retrieving…' : 'Retrieve'}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setQuestion(sample)}
                className="rounded-md border border-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
              >
                {sample}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {rag.isPending ? (
        <Card title="Retrieval" subtitle="POST /rag">
          <RagSkeleton />
        </Card>
      ) : rag.isError ? (
        <Card title="Retrieval" subtitle="POST /rag">
          <ErrorState error={rag.error} compact />
        </Card>
      ) : !data ? (
        <Empty
          title="No retrieval yet"
          hint="Submit a question to retrieve corpus snippets with citations."
        />
      ) : (
        <>
          <Card
            title="Retrieval summary"
            actions={<BookOpen className="size-4 text-slate-600" aria-hidden />}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Retrieved" value={formatCount(data.retrieved_count)} hint="snippets" />
              <Metric label="Citations" value={data.citations.length} hint="returned" />
              <Metric label="Context" value={`${data.context.length}`} hint="characters" />
              <Metric
                label="Answer"
                value={answerIsPlaceholderEcho ? 'placeholder' : 'unverified'}
                hint="not model-generated"
              />
            </div>
          </Card>

          <Card
            title="Placeholder answer"
            subtitle="echoed from the retrieved snippets — not generated"
            tone="muted"
          >
            {data.answer ? (
              <pre className="scrollbar-thin max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-mono text-xs leading-relaxed text-amber-100/90">
                {data.answer}
              </pre>
            ) : (
              <Empty compact title="Empty answer" hint="The endpoint returned an empty answer string." />
            )}
          </Card>

          <Card
            title="Retrieved context"
            subtitle="the real retrieval output"
            actions={<ScrollText className="size-4 text-slate-600" aria-hidden />}
          >
            {data.context ? (
              <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs leading-relaxed text-slate-300">
                {data.context}
              </pre>
            ) : (
              <Empty
                title="No context"
                hint={`The retrieval found 0 snippets for "${data.question}". Try a term that occurs in the Bible corpus.`}
              />
            )}
          </Card>

          <Card
            title="Citations"
            subtitle={`${citations.length} source${citations.length === 1 ? '' : 's'}`}
            actions={<Quote className="size-4 text-slate-600" aria-hidden />}
          >
            <CitationList data={data} />
          </Card>

          <RawJson data={data} label="raw /rag" />
        </>
      )}
    </div>
  )
}

function CitationList({ data }: { data: RagResult }) {
  if (data.citations.length === 0) {
    return (
      <Empty
        title="No citations"
        hint="Citations appear only when the retrieval returns snippets."
      />
    )
  }
  return (
    <ol className="flex flex-col gap-2">
      {data.citations.map((citation, index) => (
        <li
          key={`${citation.id}-${index}`}
          className="flex gap-2.5 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
        >
          <span className="shrink-0 font-mono text-[11px] text-emerald-400">[{citation.id}]</span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-mono text-[11px] text-slate-500">{citation.source}</p>
            <p className="text-xs leading-relaxed break-words text-slate-200">
              {citation.text || <span className="text-slate-600 italic">empty excerpt</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function RagSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-800" />
        ))}
      </div>
      <div className="h-24 rounded-lg bg-slate-800" />
      <div className="h-32 rounded-lg bg-slate-800" />
      <span className="sr-only">Retrieving…</span>
    </div>
  )
}