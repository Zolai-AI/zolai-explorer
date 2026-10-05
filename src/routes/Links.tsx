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
import {
  API_GAPS,
  AREA_LABELS,
  ENDPOINTS,
  publicPath,
  type EndpointSpec,
} from '../lib/endpoints'

/**
 * Endpoints outside `/api/v1`, rendered by the server — link out only.
 *
 * `note` says plainly when a path on this list is *not* a working stat: the
 * server-rendered `/review/` queue is real, but there is no review count on the
 * versioned API, so nothing here renders one.
 */
const OUTSIDE: { path: string; note: string; href: string }[] = [
  { path: '/health', note: 'Public health probe (no API key)', href: HEALTH_URL },
  { path: '/docs', note: 'OpenAPI Swagger UI', href: DOCS_URL },
  { path: '/metrics', note: 'Prometheus exposition', href: METRICS_URL },
  {
    path: '/review/',
    note: 'Review queue (HTML). /review/stats is not available — it 422s behind /review/{item_id}.',
    href: REVIEW_URL,
  },
]

const PROJECT_LINKS = [
  { label: 'Zolai Core (this API)', href: 'https://github.com/Zolai-AI/zolai-core' },
  { label: 'Zolai Explorer (this app)', href: 'https://github.com/Zolai-AI/zolai-explorer' },
  { label: 'Zolai-AI organisation', href: 'https://github.com/Zolai-AI' },
]

/**
 * The API surface page.
 *
 * The table below is rendered **once**, straight from `ENDPOINTS` in
 * `src/lib/endpoints.ts` — the same records the transports build their URLs
 * from. It used to be rendered twice (a `<Table>` plus a stacked `<ul>`), which
 * duplicated every row in the DOM and left an empty bordered box on phones.
 * Responsiveness is CSS-only now: the notes column hides below `lg` and the
 * shadcn table container scrolls.
 */
export function Links() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Link2 className="size-5 text-primary" aria-hidden />
          API surface
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Every endpoint this app actually calls, generated from one registry
          (<code className="font-mono">src/lib/endpoints.ts</code>) that also builds the request URLs —
          plus the server-rendered pages that are link-out only, and an honest list of what the
          deployment does not do yet.
        </p>
      </header>

      <Card
        title="Endpoints consumed by this app"
        subtitle={`base /api/v1 · auth header X-API-Key · ${ENDPOINTS.length} routes`}
        actions={<FileCode2 className="text-muted-foreground/70" aria-hidden />}
      >
        <Table containerClassName="scrollbar-thin scroll-fade-x">
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead className="hidden w-40 lg:table-cell">Scope</TableHead>
              <TableHead className="hidden xl:table-cell">Notes</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Copy</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ENDPOINTS.map((spec) => (
              <EndpointRow key={spec.id} spec={spec} />
            ))}
          </TableBody>
        </Table>
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
          {API_GAPS.map((gap) => (
            <li key={gap.id}>
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

function EndpointRow({ spec }: { spec: EndpointSpec }) {
  const [copied, setCopied] = useState(false)
  const path = publicPath(spec)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      toast.success('Copied', { description: path })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be blocked; the path stays visible on screen.
      toast.error('Could not copy', { description: 'Clipboard access was blocked by the browser.' })
    }
  }

  const copyButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => void copy()}
      aria-label={`Copy ${path}`}
      className="max-lg:size-10"
    >
      {copied ? <Check className="text-primary" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  )

  return (
    <TableRow>
      <TableCell>
        <Badge
          variant="outline"
          className={
            spec.method === 'GET'
              ? 'border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 font-mono text-amber-700 dark:text-amber-300'
          }
        >
          {spec.method}
        </Badge>
      </TableCell>
      <TableCell className="max-w-0">
        <code className="min-w-0 truncate font-mono text-xs">{path}</code>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {spec.scope ? (
          <code className="font-mono text-[11px] text-muted-foreground">{spec.scope}</code>
        ) : (
          <span className="text-[11px] text-muted-foreground">public</span>
        )}
        {/* The registry's grouping key, so a narrow screen still shows which
            panel owns the route. */}
        <span className="block text-[10px] text-muted-foreground/80">
          {AREA_LABELS[spec.area]}
        </span>
      </TableCell>
      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
        {spec.note}
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