import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

/**
 * Build the success string. It takes a **label only — never the value** — so
 * the confirmation cannot echo what was copied even by accident. This is the
 * secret-hygiene contract: the toast says *what* landed on the clipboard
 * ("Copied the raw JSON"), never *what it was*. Pinned in `CopyValue.test.tsx`.
 */
export function copyConfirmationMessage(label?: string): string {
  return label === undefined ? 'Copied' : `Copied ${label}`
}

/**
 * Build the failure string. Same contract as the success message: derived
 * from the label alone, never from the text that failed to copy. The value
 * stays exactly where it was — on screen — and nothing about it leaks into
 * the toast.
 */
export function copyFailureMessage(label?: string): string {
  const what = label ?? 'the text'
  return `Could not copy ${what} — your browser blocked clipboard access. Select it and copy manually.`
}

/**
 * Clipboard write that fails softly.
 *
 * `navigator.clipboard` is undefined in non-secure contexts and
 * `writeText` rejects when the permission is denied; both end in a plain
 * `false`. There is deliberately **no** `execCommand`/off-screen-textarea
 * fallback — a hidden DOM node holding a minted secret is exactly what a
 * "copy the key once" screen must not create.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** How long the button shows the check mark before reverting. */
const COPIED_FEEDBACK_MS = 2000

/**
 * Copy-to-clipboard affordance: an icon button with a tooltip and a transient
 * "Copied" state, confirmed through a `sonner` toast that names the copied
 * thing **by label only** (Cloudscape Copy to Clipboard / MoJ copy button —
 * short label, transient confirmation, no modal).
 *
 * The value is read at click time and written straight to the clipboard; it
 * is never kept in component state, never toasted, never logged, never put
 * in the tooltip or the `aria-label` (those carry the human label, e.g.
 * "the new API key" — never key material). Handing a minted secret to
 * `<CopyValue value={…}>` does not extend its lifetime: the button simply
 * forwards whatever the parent already renders once.
 */
export function CopyValue({
  value,
  label,
  className,
}: {
  value: string
  /**
   * Noun phrase describing *what* is copied, article included — "the raw
   * JSON", "the new API key". Feeds the tooltip, the `aria-label` and the
   * toast copy. It must describe the value, never be the value.
   */
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  // The clipboard write is awaited, so the component can unmount *during* it —
  // closing the mint dialog while a permission prompt is up is the realistic
  // case. Without this flag the resolve would set state on an unmounted tree
  // and schedule a revert timer that nothing owns any more.
  const mounted = useRef(true)

  // The transient check mark must not outlive the component (and the value
  // it closes over): clear the pending revert on unmount.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const name = label === undefined ? 'Copy' : `Copy ${label}`

  const handleCopy = async () => {
    if (await writeClipboard(value)) {
      if (!mounted.current) return
      if (timer.current !== null) window.clearTimeout(timer.current)
      setCopied(true)
      timer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
      toast.success(copyConfirmationMessage(label))
    } else {
      toast.error('Clipboard blocked', { description: copyFailureMessage(label) })
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Icon-only control, so it carries an `aria-label` (the label, never
              the value). No `title`: Radix already renders the tooltip, and a
              native title would paint a second one over it. `max-lg:size-10` is
              the touch floor — the vendored button gives only the *text* sizes
              a 40px floor. */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={name}
            className={cn(
              'text-muted-foreground hover:text-foreground max-lg:size-10',
              className,
            )}
            onClick={() => void handleCopy()}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
