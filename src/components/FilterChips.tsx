import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

export type FilterChip = {
  id: string
  label: string
  value: string
  /**
   * Present only where the page has a real setter. A chip without one renders
   * as a plain badge, because a ✕ that cannot clear anything is a lie.
   */
  onRemove?: () => void
}

/**
 * Applied-filter chips: one badge per filter, a ✕ only on the filters the
 * caller can actually remove, and (typically) a non-interactive chip stating
 * the real result count. Replaces filter state spelled out in prose, which
 * could say what was applied or how much was shown, never both at once.
 */
export function FilterChips({
  chips,
  onClearAll,
}: {
  chips: FilterChip[]
  onClearAll?: () => void
}) {
  // Removing a chip unmounts it (and a refetch may follow), so focus loses its
  // button. The live region outlives that button and says what happened.
  const [announcement, setAnnouncement] = useState('')
  const removable = chips.filter((chip) => chip.onRemove)
  // A local const so the click handler closes over an already-narrowed value.
  const clearAll = removable.length >= 2 ? onClearAll : undefined

  const remove = (chip: FilterChip) => {
    setAnnouncement(`Filter removed: ${chip.label} ${chip.value}.`)
    chip.onRemove?.()
  }

  return (
    <>
      {chips.length > 0 && (
        <div
          role="group"
          aria-label="Applied filters"
          className="flex flex-wrap items-center gap-2"
        >
          {chips.map((chip) =>
            chip.onRemove ? (
              <Badge
                key={chip.id}
                variant="secondary"
                // `h-auto`/`py-0` let the remove button size the chip, and
                // `overflow-visible` keeps that button's focus ring unclipped.
                className="h-auto gap-1 overflow-visible py-0 pr-0.5"
              >
                <span className="text-muted-foreground">{chip.label}:</span>
                <span>{chip.value}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="max-lg:size-10"
                  aria-label={`Remove filter: ${chip.label} ${chip.value}`}
                  onClick={() => remove(chip)}
                >
                  <X aria-hidden />
                </Button>
              </Badge>
            ) : (
              <Badge key={chip.id} variant="outline" className="gap-1">
                <span className="text-muted-foreground">{chip.label}:</span>
                <span>{chip.value}</span>
              </Badge>
            ),
          )}
          {/* One removable chip is already clearable by its own ✕; "Clear all"
              only earns its place when it clears more than that. */}
          {clearAll && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="max-lg:h-10"
              onClick={() => {
                setAnnouncement('All filters removed.')
                clearAll?.()
              }}
            >
              Clear all
            </Button>
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  )
}
