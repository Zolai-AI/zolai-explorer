import { useState } from 'react'
import { AlertTriangle, Check, Copy, ExternalLink, FileCode2, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '../components/Card'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import { DOCS_URL, HEALTH_URL, METRICS_URL, REVIEW_URL } from '../lib/api'

type Endpoint = {
  method: 'GET' | 'POST'
  path: string
  note: string
}

/** Endpoints this studio consumes, under the versioned `/api/v1` surface. */
const VERSIONED: Endpoint[] = [
  { method: 'GET', path: '/api/v1/word/{w}', note: 'Word entry: frequency, POS, collocations' },
  { method: 'GET', path: '/api/v1/word/{w}/forms', note: 'Observed surface forms' },
  { method: 'GET', path: '/api/v1/word/{w}/contexts', note: 'Parallel EN/ZO Bible verses' },
  { method: 'GET', path: '/api/v1/word/{w}/collocations', note: 'PMI collocation pairs' },
  { method: 'GET', path: '/api/v1/word/{w}/patterns', note: 'Observed grammar patterns' },
  { method: 'GET', path: '/api/v1/word/{w}/evidence', note: 'Tiered provenance records' },
  { method: 'POST', path: '/api/v1/analyze/sentence', note: 'Tokenise one sentence' },
  { method: 'POST', path: '/api/v1/analyze/paragraph', note: 'Segment a paragraph' },
  { method: 'POST', path: '/api/v1/search', note: 'Lexical corpus search' },
  { method: 'POST', path: '/api/v1/rag', note: 'Retrieval + placeholder answer' },
  { method: 'GET', path: '/api/v1/knowledge/version', note: 'Knowledge build version' },
  { method: 'GET', path: '/api/v1/knowledge/statistics', note: 'Collection row counts' },
]

/** Endpoints outside `/api/v1`, rendered by the server — link out only. */
const OUTSIDE: { path: string; note: string; href: string }[] = [
  { path: '/health', note: 'Public health probe (no API key)', href: HEALTH_URL },
  { path: '/docs', note: 'OpenAPI Swagger UI', href: DOCS_URL },
  { path: '/metrics', note: 'Prometheus exposition', href: METRICS_URL },
  { path: '/review/', note: 'Review workbench (HTML)', href: REVIEW_URL },
]

/**
 * Known API gaps, stated plainly so an empty panel is never read as a bug in
 * this app. Every item here was verified against the live deployment.
 */
const GAPS = [
  {
    title: '/rag answers are placeholder echoes',
    body: 'Retrieval is real — context and citations come from the corpus — but the answer string is a template, because the server holds a placeholder GEMINI_API_KEY and calls no model.',
  },
  {
    title: '/analyze/sentence returns empty pos, grammar and entities',
    body: 'Only tokens are populated today. The Analyze panel labels the missing sections instead of showing empty boxes.',
  },
  {
    title: 'sentence_frequency is always 0',
    body: 'The word explorer shows "—" for sentence counts rather than a misleading zero.',
  },
  {
    title: 'morphology and forms are usually empty',
    body: 'Most entries have no morphology rows; those sections collapse to a "not populated" note rather than a broken panel.',
  },
  {
    title: '/api/v1/review/stats is not registered',
    body: 'It answers 200 {"error":"Not found"} — the path does not exist on the versioned surface. The unversioned /review/stats instead 422s, because /review/{item_id} swallows "stats". This page links at the server-rendered /review/ instead.',
  },
  {
    title: 'Authentication is in warn mode',
    body: 'The API currently accepts unauthenticated requests and may flip to enforce mode. Add a key now so nothing breaks when it does.',
  },
]

const PROJECT_LINKS = [
  { label: 'Zolai Core (this API)', href: 'https://github.com/Zolai-AI/zolai-core' },
  { label: 'Zolai Explorer (this app)', href: 'https://github.com/Zolai-AI/zolai-explorer' },
  { label: 'Zolai-AI organisation', href: 'https://github.com/Zolai-AI' },
]

export function Links() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Link2 className="size-5 text-primary" aria-hidden />
          API surface
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          The endpoints this studio consumes, the server-rendered pages that are link-out only, and an
          honest list of what the deployment does not do yet.
        </p>
      </header>

      <Card
        title="Endpoints consumed by this app"
        subtitle="base /api/v1 · auth header X-API-Key"
        actions={<FileCode2 className="text-muted-foreground/70" aria-hidden />}
      >
        {/* Table on `sm`+; the stacked list below keeps 375px readable. */}
        <Table className="hidden sm:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead className="hidden lg:table-cell">Notes</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Copy</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {VERSIONED.map((endpoint) => (
              <EndpointRow key={`${endpoint.method} ${endpoint.path}`} endpoint={endpoint} />
            ))}
          </TableBody>
        </Table>

        <ul className="flex flex-col gap-1.5 sm:hidden">
          {VERSIONED.map((endpoint) => (
            <li key={`${endpoint.method} ${endpoint.path}`}>
              <EndpointRow endpoint={endpoint} stacked />
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Server-rendered pages"
        subtitle="open in a new tab — not embedded"
        actions={<ExternalLink className="text-muted-foreground/70" aria-hidden />}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {OUTSIDE.map((item) => (
            <li key={item.path}>
              <Button
                variant="outline"
                asChild
                className="h-auto max-lg:min-h-11 w-full items-start justify-start gap-2 px-3 py-2.5 text-left"
              >
                <a href={item.href} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-primary">{item.path}</span>
                    <span className="block text-xs text-muted-foreground">{item.note}</span>
                  </span>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Known API gaps" subtitle="stated here so empty panels are never read as bugs">
        <ul className="flex flex-col gap-2">
          {GAPS.map((gap) => (
            <li key={gap.title}>
              <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                <AlertTriangle aria-hidden />
                <AlertTitle>{gap.title}</AlertTitle>
                <AlertDescription className="text-amber-800/90 dark:text-amber-100/70">
                  {gap.body}
                </AlertDescription>
              </Alert>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Project" subtitle="Zolai-AI">
        <ul className="flex flex-col gap-1.5 text-xs">
          {PROJECT_LINKS.map((link) => (
            <li key={link.href}>
              <Button variant="link" size="xs" asChild className="h-auto max-lg:h-10 gap-1.5 px-0">
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  <ExternalLink aria-hidden />
                  {link.label}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function EndpointRow({ endpoint, stacked = false }: { endpoint: Endpoint; stacked?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint.path)
      setCopied(true)
      toast.success('Copied', { description: endpoint.path })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be blocked; the path stays visible on screen.
      toast.error('Could not copy', { description: 'Clipboard access was blocked by the browser.' })
    }
  }

  const method = (
    <Badge
      variant="outline"
      className={
        endpoint.method === 'GET'
          ? 'border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 font-mono text-amber-700 dark:text-amber-300'
      }
    >
      {endpoint.method}
    </Badge>
  )

  const path = <code className="min-w-0 truncate font-mono text-xs">{endpoint.path}</code>

  const copyButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => void copy()}
      aria-label={`Copy ${endpoint.path}`}
      className="max-lg:size-10"
    >
      {copied ? <Check className="text-primary" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  )

  if (stacked) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        {method}
        {path}
        <span className="ml-auto shrink-0">{copyButton}</span>
      </div>
    )
  }

  return (
    <TableRow>
      <TableCell>{method}</TableCell>
      <TableCell className="max-w-0">{path}</TableCell>
      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
        {endpoint.note}
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>{copyButton}</TooltipTrigger>
          <TooltipContent>Copy path</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}
