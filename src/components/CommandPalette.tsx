import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Bot,
  Database,
  FileText,
  Gauge,
  KeyRound,
  LogIn,
  Link2,
  MessageSquareQuote,
  Monitor,
  Moon,
  Palette,
  ScanText,
  Search,
  SearchIcon,
  Settings2,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import {
  COMMAND_ACTIONS,
  COMMAND_GROUP_ACTIONS,
  COMMAND_GROUP_APPEARANCE,
  COMMAND_GROUP_NAV,
  filterCommands,
  resolveCommandLookup,
  type CommandActionSpec,
} from '../lib/commands'
import { useRole } from '../lib/auth'
import { useThemePreference } from '../lib/useTheme'
import type { Theme } from '../lib/theme'
import { Button } from './ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Field, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'

const ICONS: Record<CommandActionSpec['kind'], LucideIcon> = {
  navigate: Gauge,
  theme: Palette,
  'api-key': KeyRound,
  word: Search,
}

/**
 * Route commands reuse their nav icon; the ids mirror `NAV_ITEMS`.
 *
 * `nav-login` is here even though the sign-in record is not a nav item: it is in
 * the palette through the registry's `palette` flag, and a registry command
 * without an icon would silently fall back to the generic `Gauge`.
 */
const ROUTE_ICONS: Record<string, LucideIcon> = {
  'nav-dashboard': Gauge,
  'nav-login': LogIn,
  'nav-word': BookOpen,
  'nav-analyze': ScanText,
  'nav-search': SearchIcon,
  'nav-rag': MessageSquareQuote,
  'nav-assistant': MessageSquareQuote,
  'nav-agent': Bot,
  'nav-data': Database,
  'nav-links': Link2,
  'nav-settings': Settings2,
  'nav-review': FileText,
}

const THEME_ICONS: Record<Theme, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export function isPaletteShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
}

/**
 * ⌘K / Ctrl+K command palette.
 *
 * Groups mirror the shell: the registry's palette routes (sign-in included), the
 * two actions (API key dialog, word lookup) and the three theme preferences.
 * Selection is handled here so every action is one click *or* Enter — `cmdk`
 * gives Enter for free, which is what the browser check exercises.
 *
 * The palette itself is a `<Dialog>`, so it inherits the app's focus trap,
 * escape handling and mobile sizing (`sm:max-w-lg`, full-width below `sm`).
 */
export function CommandPalette({
  open,
  onOpenChange,
  onOpenApiKey,
}: {
  /** Controlled by the shell so the TopBar trigger and ⌘K share one dialog. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the existing API-key dialog; the palette never renders it itself. */
  onOpenApiKey: () => void
}) {
  const navigate = useNavigate()
  const { theme, setTheme } = useThemePreference()
  // Same gate as the Sidebar: a route the shell would prompt on is not offered.
  const role = useRole()
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupValue, setLookupValue] = useState('')
  const [lookupError, setLookupError] = useState<string | undefined>(undefined)

  // Global shortcut. `⌘K`/`Ctrl+K` in any field opens the palette; when the
  // lookup step is open its own input owns the keyboard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isPaletteShortcut(event)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const close = useCallback(() => {
    onOpenChange(false)
    setLookupOpen(false)
    setLookupError(undefined)
  }, [onOpenChange])

  const run = useCallback(
    (action: CommandActionSpec) => {
      close()
      switch (action.kind) {
        case 'navigate':
          if (action.to) navigate(action.to)
          return
        case 'theme':
          if (action.theme) setTheme(action.theme)
          return
        case 'api-key':
          onOpenApiKey()
          return
        case 'word':
          // Second step: ask for the headword, then route to /word/{word}.
          setLookupValue('')
          setLookupError(undefined)
          setLookupOpen(true)
      }
    },
    [close, navigate, onOpenApiKey, setTheme],
  )

  const submitLookup = useCallback(() => {
    const result = resolveCommandLookup(lookupValue)
    if (!result.ok) {
      setLookupError(result.issues[0] ?? 'Invalid word.')
      return
    }
    setLookupError(undefined)
    setLookupOpen(false)
    navigate(result.value.path)
  }, [lookupValue, navigate])

  const groups = useMemo(() => {
    const visible = filterCommands(COMMAND_ACTIONS, role)
    return [
      { heading: COMMAND_GROUP_NAV, actions: visible.filter((a) => a.group === COMMAND_GROUP_NAV) },
      {
        heading: COMMAND_GROUP_ACTIONS,
        actions: visible.filter((a) => a.group === COMMAND_GROUP_ACTIONS),
      },
      {
        heading: COMMAND_GROUP_APPEARANCE,
        actions: visible.filter((a) => a.group === COMMAND_GROUP_APPEARANCE),
      },
    ]
  }, [role])

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
          else onOpenChange(true)
        }}
        title="Command palette"
        description="Jump to a workbench, sign in, look up a word, or change the theme."
      >
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No command matches that search.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.heading} heading={group.heading}>
              {group.actions.map((action) => {
                const Icon =
                  (action.kind === 'navigate' && ROUTE_ICONS[action.id]) ||
                  (action.kind === 'theme' && action.theme && THEME_ICONS[action.theme]) ||
                  ICONS[action.kind]
                return (
                  <CommandItem
                    key={action.id}
                    value={`${action.id} ${action.label} ${action.keywords}`}
                    onSelect={() => run(action)}
                    className="max-lg:min-h-11"
                  >
                    <Icon aria-hidden />
                    <span className="min-w-0 truncate">{action.label}</span>
                    {action.kind === 'theme' && action.theme === theme && (
                      <span className="ml-auto text-[10px] tracking-wider text-muted-foreground uppercase">
                        current
                      </span>
                    )}
                    {action.hint && <CommandShortcut>{action.hint}</CommandShortcut>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <Dialog
        open={lookupOpen}
        onOpenChange={(next) => {
          if (!next) {
            setLookupOpen(false)
            setLookupError(undefined)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Look up a word</DialogTitle>
            <DialogDescription>
              Opens <code className="font-mono">/word/{'{word}'}</code> for one Zolai headword.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              submitLookup()
            }}
          >
            <Field data-invalid={lookupError ? 'true' : undefined}>
              <FieldLabel htmlFor="palette-word">Word</FieldLabel>
              <Input
                id="palette-word"
                value={lookupValue}
                onChange={(event) => setLookupValue(event.target.value)}
                placeholder="pasian"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-invalid={lookupError ? 'true' : undefined}
                className="h-10 font-mono placeholder:font-sans"
              />
              <FieldError>{lookupError}</FieldError>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLookupOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Open word</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The visible affordance in the TopBar — visible on mobile, not only via ⌘K. */
export function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onOpen}
      // 40px minimum touch target on phones; the hint is decoration, the
      // button and its icon are what a phone user actually taps.
      className="max-lg:h-10 max-lg:w-10 max-lg:justify-center max-lg:px-0 sm:w-56"
      title="Command palette (⌘K)"
    >
      <Search aria-hidden />
      <span className="hidden min-w-0 flex-1 truncate text-left text-muted-foreground sm:inline">
        Search commands…
      </span>
      <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
        ⌘K
      </kbd>
    </Button>
  )
}
