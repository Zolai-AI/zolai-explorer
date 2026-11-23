import { useId, useState } from 'react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

/**
 * A value too long for its cell is previewed, and the rest is one keystroke
 * away. The `title` attribute this replaced failed WCAG 1.4.13 on all three
 * counts — unreachable by keyboard, undismissable except by moving the pointer,
 * and gone the instant you tried to select the text out of it — so a long
 * `old_value` or a nested `morphology` object could not be read whole in the
 * app at all. The disclosure is a button, so it is focusable, opens and closes
 * from the same control, and keeps the full text on screen while it is open.
 *
 * Shared so any table cell that truncates reaches the whole value the same way:
 * a real `type="button"` toggle with `aria-expanded`, `aria-controls` only while
 * open (never a reference to a node that is not in the DOM), and **no native
 * `title=`**. It carries no opinion about *what* the text is — callers decide
 * the preview width (`limit`) and whether it is monospaced.
 */
export function TruncatedValue({
  text,
  limit,
  mono = false,
}: {
  text: string
  limit: number
  mono?: boolean
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const { preview, truncated } = previewCell(text, limit)
  if (!truncated) {
    return <span className={cn('break-words', mono && 'font-mono text-xs')}>{text}</span>
  }
  return (
    <span className="block">
      <span
        id={open ? contentId : undefined}
        className={cn('block break-words whitespace-pre-wrap', mono && 'font-mono text-xs')}
      >
        {open ? text : preview}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="-ml-2 text-muted-foreground"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {open ? 'Show less' : 'Show full value'}
      </Button>
    </span>
  )
}

/**
 * The preview is always a true prefix of the value, and the ellipsis only ever
 * means "characters were left out" — never an approximation of the content.
 */
export function previewCell(text: string, limit: number): { preview: string; truncated: boolean } {
  return text.length > limit ? { preview: `${text.slice(0, limit)}…`, truncated: true } : { preview: text, truncated: false }
}
