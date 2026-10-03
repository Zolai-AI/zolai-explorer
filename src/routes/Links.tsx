import { useState } from 'react'
import { AlertTriangle, Check, Copy, ExternalLink, FileCode2, Link2 } from 'lucide-react'
import { Card } from '../components/Card'
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
    title: '/api/v1/review/stats is not usable',
    body: 'It answers 422 on this deployment, so this page links at the server-rendered /review/ page instead.',
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
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-50">
          <Link2 className="size-5 text-emerald-400" aria-hidden />
          API surface
        </h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          The endpoints this studio consumes, the server-rendered pages that are link-out only, and an
          honest list of what the deployment does not do yet.
        </p>
      </header>

      <Card
        title="Endpoints consumed by this app"
        subtitle="base /api/v1 · auth header X-API-Key"
        actions={<FileCode2 className="size-4 text-slate-600" aria-hidden />}
      >
        <div className="flex flex-col gap-1.5">
          {VERSIONED.map((endpoint) => (
            <CopyableEndpoint key={`${endpoint.method} ${endpoint.path}`} endpoint={endpoint} />
          ))}
        </div>
      </Card>

      <Card
        title="Server-rendered pages"
        subtitle="open in a new tab — not embedded"
        actions={<ExternalLink className="size-4 text-slate-600" aria-hidden />}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {OUTSIDE.map((item) => (
            <li key={item.path}>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex h-full items-start gap-2 rounded-lg border border-slate-800 px-3 py-2.5 transition hover:border-emerald-500/30 hover:bg-slate-900"
              >
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-emerald-300">{item.path}</span>
                  <span className="block text-xs text-slate-400">{item.note}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Known API gaps"
        subtitle="stated here so empty panels are never read as bugs"
        actions={<AlertTriangle className="size-4 text-amber-500" aria-hidden />}
      >
        <ul className="flex flex-col gap-2">
          {GAPS.map((gap) => (
            <li key={gap.title} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-200">{gap.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/70">{gap.body}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Project" subtitle="Zolai-AI">
        <ul className="flex flex-col gap-1.5 text-xs">
          {PROJECT_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-emerald-300"
              >
                <ExternalLink className="size-3" aria-hidden />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function CopyableEndpoint({ endpoint }: { endpoint: Endpoint }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint.path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be blocked; the path stays visible on screen.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
          endpoint.method === 'GET'
            ? 'bg-emerald-500/10 text-emerald-300'
            : 'bg-amber-500/10 text-amber-300'
        }`}
      >
        {endpoint.method}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{endpoint.path}</code>
      <span className="hidden truncate text-[11px] text-slate-500 sm:block">{endpoint.note}</span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${endpoint.path}`}
        className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-400" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  )
}