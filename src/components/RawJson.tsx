import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * Collapsible raw-JSON disclosure for power users. Rich panels render semantic
 * cards/tables; this keeps the exact payload one click away without dumping
 * JSON into the primary reading experience.
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
      className="rounded-lg border border-slate-800/80 bg-slate-950/50"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 transition select-none hover:text-slate-200">
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        {label}
      </summary>
      <pre
        className="scrollbar-thin max-h-56 overflow-auto border-t border-slate-800/80 px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-300"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </details>
  )
}