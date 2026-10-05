import { useCallback, useState, type FormEvent } from 'react'
import { MessageSquareQuote, Send, ShieldCheck, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useAssistantChat, type AssistantMode } from '../features/assistant/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { Skeleton } from '../components/Skeleton'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { can, useRole } from '../lib/auth'
import { formatCount, formatScore } from '../lib/format'
import type { ChatResponse } from '../lib/schemas'

type Exchange = {
  role: 'user' | 'assistant'
  text: string
  mode: AssistantMode
  response?: ChatResponse
}

/**
 * Assistant chat.
 *
 * Honesty rules (AGENTS.md):
 * - a `retrieval_only` answer is labelled **“Retrieval (no model)”** — never
 *   “generated”, never “AI answer”;
 * - the admin↔public switch only renders for an admin role, because the admin
 *   route is strict role + scope gated server-side;
 * - admin mode shows `provider`/`model` and the tool trace; public mode shows
 *   citations only.
 */
export function Assistant() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [mode, setMode] = useState<AssistantMode>('public')
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Exchange[]>([])
  const chat = useAssistantChat()

  // The admin switch must not outlive the role it was enabled by (key cleared).
  const activeMode: AssistantMode = isAdmin ? mode : 'public'

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const clean = message.trim()
      if (!clean || chat.isPending) return
      chat.mutate(
        { message: clean, mode: activeMode },
        {
          onSuccess: (response) => {
            setHistory((previous) => [
              ...previous,
              { role: 'user', text: clean, mode: activeMode },
              { role: 'assistant', text: response.answer, mode: activeMode, response },
            ])
            setMessage('')
          },
          onError: (error: unknown) =>
            toast.error('Chat failed', {
              description: error instanceof Error ? error.message : String(error),
            }),
        },
      )
    },
    [activeMode, chat, message],
  )

  const last = [...history].reverse().find((entry) => entry.role === 'assistant')?.response

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MessageSquareQuote className="size-5 text-primary" aria-hidden />
            Assistant
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Retrieval-grounded chat over the knowledge base. With no active provider the server
            answers honestly from retrieval — no model is called.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <span className="text-xs font-medium">Admin mode</span>
            <Switch
              checked={mode === 'admin'}
              onCheckedChange={(next) => setMode(next ? 'admin' : 'public')}
              aria-label="Use the admin assistant route"
            />
          </div>
        )}
      </header>

      {!isAdmin && (
        <Alert>
          <ShieldCheck aria-hidden />
          <AlertTitle>Public assistant</AlertTitle>
          <AlertDescription>
            Posting to <span className="font-mono">/assistant/chat</span> — anonymous-safe in every
            auth mode, retrieval tools only. An admin key unlocks the admin route with the full
            tool set and trace.
          </AlertDescription>
        </Alert>
      )}

      <Card
        title="Message"
        subtitle={`POST ${activeMode === 'admin' ? '/admin/assistant/chat' : '/assistant/chat'}`}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about a Zolai word, verse or grammar rule…"
            rows={3}
            className="min-h-20 resize-y"
            aria-label="Message for the assistant"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!message.trim() || chat.isPending} className="h-10">
              <Send aria-hidden />
              {chat.isPending ? 'Thinking…' : 'Send'}
            </Button>
          </div>
        </form>
      </Card>

      {chat.isPending ? (
        <Card title="Answer" subtitle="pending">
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-5/6" />
            <span className="sr-only">Waiting for the assistant…</span>
          </div>
        </Card>
      ) : chat.isError ? (
        <ErrorState error={chat.error} compact />
      ) : !last ? (
        <Empty
          title="No conversation yet"
          hint="Ask a question. Answers carry citations back to the corpus; without an active provider the server says so instead of inventing text."
        />
      ) : (
        <AnswerPanel response={last} mode={activeMode} />
      )}

      {history.length > 0 && (
        <Card title="Transcript" subtitle={`${history.length} messages`} tone="muted">
          <ol className="flex flex-col gap-3">
            {history.map((entry, index) => (
              <li
                key={index}
                className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    entry.role === 'user'
                      ? 'max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm'
                      : 'max-w-[85%] rounded-lg border bg-muted/40 px-3 py-2 text-sm'
                  }
                >
                  <p className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    {entry.role === 'user' ? 'You' : `Assistant · ${entry.mode}`}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}

function AnswerPanel({ response, mode }: { response: ChatResponse; mode: AssistantMode }) {
  const retrievalOnly = response.retrieval_only
  const citations = response.citations ?? []

  return (
    <>
      <Card
        title={retrievalOnly ? 'Retrieval (no model)' : 'Answer'}
        subtitle={
          retrievalOnly
            ? 'retrieval_only: true — no active provider, answered from the corpus'
            : `${response.provider || 'provider unset'} · ${response.model || 'model unset'}`
        }
        tone={retrievalOnly ? 'muted' : 'accent'}
        actions={
          retrievalOnly ? (
            <Badge variant="outline">retrieval_only</Badge>
          ) : (
            <Badge>generated</Badge>
          )
        }
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{response.answer}</p>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <div>
            <dt className="inline">Latency </dt>
            <dd className="inline font-mono">{formatCount(Math.round(response.latency_ms))} ms</dd>
          </div>
          <div>
            <dt className="inline">Turns </dt>
            <dd className="inline font-mono">{formatCount(response.turns)}</dd>
          </div>
          {mode === 'admin' && (
            <div>
              <dt className="inline">Route </dt>
              <dd className="inline font-mono">/admin/assistant/chat</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Citations" subtitle={`${citations.length} source${citations.length === 1 ? '' : 's'}`}>
        {citations.length === 0 ? (
          <Empty
            compact
            title="No citations"
            hint="The server returned no citable evidence for this message."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {citations.map((citation, index) => (
              <li
                key={`${citation.source}-${citation.ref}-${index}`}
                className="rounded-lg border bg-muted/40 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge variant="secondary">{citation.source}</Badge>
                  {citation.ref && (
                    <span className="font-mono text-muted-foreground">{citation.ref}</span>
                  )}
                  {citation.score > 0 && (
                    <span className="ml-auto font-mono text-muted-foreground">
                      {formatScore(citation.score)}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed break-words">{citation.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {mode === 'admin' && (
        <Card
          title="Tool trace"
          subtitle={`${response.tool_calls.length} call${response.tool_calls.length === 1 ? '' : 's'} · admin inspector`}
          actions={<Wrench className="text-muted-foreground/70" aria-hidden />}
        >
          {response.tool_calls.length === 0 ? (
            <Empty
              compact
              title="No tool calls"
              hint="The model answered directly, or the run fell back before calling a tool."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {response.tool_calls.map((call, index) => (
                <li
                  key={`${call.name}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
                >
                  <span className="font-mono font-medium">{call.name}</span>
                  <Badge variant={call.ok ? 'secondary' : 'destructive'}>
                    {call.status || (call.ok ? 'ok' : 'failed')}
                  </Badge>
                  <span className="ml-auto font-mono text-muted-foreground">
                    {formatCount(Math.round(call.latency_ms))} ms · turn {formatCount(call.turn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
