import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Collapsible raw-JSON disclosure for power users. Rich panels render semantic
 * cards/tables; this keeps the exact payload one click away without dumping
 * JSON into the primary reading experience.
 *
 * Deliberately a native `<details>`: it works before hydration, needs no JS,
 * and stays out of the way of the shadcn components.
 */
export function RawJson({
  data,
  label = 'raw JSON',
  defaultOpen = false,
  maxHeight = '20rem',
}: {
  data: unknown
  label?: string
  defaultOpen?: boolean
  maxHeight?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const text = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return '/* payload could not be serialised */'
    }
  }, [data])

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="group overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      <summary
        className={cn(
          'flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground select-none',
          'hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        )}
      >
        <ChevronRight
          className="size-3.5 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {label}
      </summary>
      <pre
        className="scrollbar-thin overflow-auto border-t border-border px-3 py-3 font-mono text-[11px] leading-relaxed text-foreground"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </details>
  )
}
