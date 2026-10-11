import { useState, type FormEvent } from 'react'
import { AlertTriangle, BookOpen, MessageSquareQuote, Quote, ScrollText, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { RAG_LIMITS, useRag } from '../features/rag/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { Metric } from '../components/StatTile'
import { Skeleton } from '../components/Skeleton'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { formatCount } from '../lib/format'
import type { RagResult } from '../lib/schemas'

const SAMPLES = ['Pasian', 'gam', 'thupha', 'kei ding', 'bang hang pai na hiam']

/**
 * Shown only when the server wrote the answer with a model.
 *
 * Names the provider and model that produced it, so the text below is
 * attributable rather than anonymous.
 */
function GeneratedNotice({ provider, model }: { provider: string; model: string }) {
  return (
    <Alert>
      <Sparkles aria-hidden />
      <AlertTitle>Answer written by the configured model</AlertTitle>
      <AlertDescription>
        <span className="font-mono">{provider || 'provider unset'}</span>
        {model ? <> · <span className="font-mono">{model}</span></> : null} — answering from the
        retrieved rows only. Each claim cites its bracketed source, and anything the evidence does
        not cover is reported as missing rather than filled in.
      </AlertDescription>
    </Alert>
  )
}

/**
 * Shown when the server returned evidence instead of a written answer.
 *
 * The server distinguishes "no provider configured" from "the call failed", and
 * says which — collapsing the two would point an operator at a missing API key
 * during what is really a timeout or an empty completion.
 */
function EvidenceNotice({ providerError }: { providerError: string }) {
  const failedCall = providerError !== '' && providerError !== 'no_active_provider'
  return (
    <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <AlertTriangle aria-hidden />
      <AlertTitle>Evidence only — no model wrote this answer</AlertTitle>
      <AlertDescription className="text-amber-800/90 dark:text-amber-100/80">
        {failedCall ? (
          <>
            A model was resolved but the call did not return an answer
            {providerError ? (
              <>
                {' '}
                (<span className="font-mono">{providerError}</span>)
              </>
            ) : null}
            . What follows is the retrieved evidence, not a written response.
          </>
        ) : (
          <>
            No LLM provider is active, so the <span className="font-mono">answer</span> below is
            the retrieved evidence rather than a written response. Treat the{' '}
            <span className="font-mono">context</span> and{' '}
            <span className="font-mono">citations</span> as the real output.
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function Rag() {
  const [question, setQuestion] = useState(SAMPLES[0])
  const [limit, setLimit] = useState<string>(String(RAG_LIMITS[1]))
  const rag = useRag()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = question.trim()
    if (!clean) return
    rag.mutate(
      { question: clean, limit: Number(limit) },
      {
        onError: (error: unknown) =>
          toast.error('Retrieval failed', {
            description: error instanceof Error ? error.message : String(error),
          }),
      },
    )
  }

  const data = rag.data
  const citations = data?.citations ?? []
  // Provenance comes from the server, not from pattern-matching the prose. The
  // older heuristic (`/^Based on \d+ sources:/`) is kept only as a floor for a
  // server that predates the flags — and it can only ever *downgrade* a claim
  // of generation, never invent one.
  const answerIsPlaceholderEcho =
    !data ||
    data.retrieval_only ||
    !data.generated ||
    data.retrieved_count === 0 ||
    data.answer.trim() === '' ||
    /^Based on \d+ sources:/i.test(data.answer.trim())

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MessageSquareQuote className="size-5 text-primary" aria-hidden />
          RAG retrieval
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Retrieval-augmented generation endpoint. The context and citations are real corpus rows;
          the answer is written by the provider configured on the server, from those rows only.
          With no provider the server returns the evidence itself and says so.
        </p>
      </header>

      {data &&
        (answerIsPlaceholderEcho ? (
          <EvidenceNotice providerError={data.provider_error} />
        ) : (
          <GeneratedNotice provider={data.provider} model={data.model} />
        ))}

      <Card
        title="Question"
        subtitle="POST /rag"
        actions={<Sparkles className="text-muted-foreground/70" aria-hidden />}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="min-w-0">
              <Label htmlFor="rag-question">Question or Zolai query</Label>
              <Input
                id="rag-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Pasian"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 h-10"
              />
            </div>
            <div className="sm:w-28">
              <Label htmlFor="rag-limit">Limit</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="rag-limit" className="mt-1.5 h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RAG_LIMITS.map((choice) => (
                    <SelectItem key={choice} value={String(choice)}>
                      {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={!question.trim() || rag.isPending} className="h-10">
              {rag.isPending ? 'Retrieving…' : 'Retrieve'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((sample) => (
              <Button
                key={sample}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setQuestion(sample)}
                className="max-lg:h-10 font-mono font-normal"
              >
                {sample}
              </Button>
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
        <Empty title="No retrieval yet" hint="Submit a question to retrieve corpus snippets with citations." />
      ) : (
        <>
          <Card
            title="Retrieval summary"
            actions={<BookOpen className="text-muted-foreground/70" aria-hidden />}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Retrieved" value={formatCount(data.retrieved_count)} hint="snippets" />
              <Metric label="Citations" value={data.citations.length} hint="returned" />
              <Metric label="Context" value={`${data.context.length}`} hint="characters" />
              <Metric
                label="Answer"
                value={answerIsPlaceholderEcho ? 'evidence' : 'generated'}
                hint={
                  answerIsPlaceholderEcho
                    ? 'not model-written'
                    : data?.model || 'model-written'
                }
              />
            </div>
          </Card>

          {/* Titled from what the server reported, not from a fixed label. */}
          <Card
            title={answerIsPlaceholderEcho ? 'Retrieved evidence' : 'Answer'}
            subtitle={
              answerIsPlaceholderEcho
                ? 'the server returned its evidence — no model wrote this'
                : `${data.provider || 'provider unset'} · ${data.model || 'model unset'}`
            }
            tone={answerIsPlaceholderEcho ? 'muted' : 'accent'}
          >
            {data.answer ? (
              answerIsPlaceholderEcho ? (
                <pre className="scrollbar-thin max-h-48 overflow-auto rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-amber-900 dark:text-amber-100">
                  {data.answer}
                </pre>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.answer}</p>
              )
            ) : (
              <Empty compact title="Empty answer" hint="The endpoint returned an empty answer string." />
            )}
          </Card>

          <Card
            title="Retrieved context"
            subtitle="the real retrieval output"
            actions={<ScrollText className="text-muted-foreground/70" aria-hidden />}
          >
            {data.context ? (
              <pre className="scrollbar-thin max-h-72 overflow-auto rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
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
            actions={<Quote className="text-muted-foreground/70" aria-hidden />}
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
    return <Empty title="No citations" hint="Citations appear only when the retrieval returns snippets." />
  }
  return (
    <ol className="flex flex-col gap-2">
      {data.citations.map((citation, index) => (
        <li
          key={`${citation.id}-${index}`}
          className="flex gap-2.5 rounded-lg border bg-muted/40 p-3"
        >
          <span className="shrink-0 font-mono text-[11px] text-primary">[{citation.id}]</span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-mono text-[11px] text-muted-foreground">{citation.source}</p>
            <p className="text-xs leading-relaxed break-words">
              {citation.text || <span className="text-muted-foreground italic">empty excerpt</span>}
            </p>
            {/* The gloss is the citable part; a bare headword proves nothing. */}
            {citation.definition && (
              <p className="mt-1 text-xs leading-relaxed break-words text-muted-foreground">
                {citation.definition}
              </p>
            )}
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
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-32" />
      <span className="sr-only">Retrieving…</span>
    </div>
  )
}
