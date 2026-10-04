import * as React from 'react'
import {
  CircleCheck,
  Info,
  Loader2,
  OctagonX,
  TriangleAlert,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useResolvedTheme } from '../../lib/useTheme'

/**
 * shadcn's `sonner` registry item, adapted for this app:
 *   - icons resolved to lucide directly (the upstream item imports an
 *     `IconPlaceholder` that only exists in the shadcn "create" app),
 *   - the theme comes from `src/lib/theme.ts` instead of `next-themes`, which
 *     is Next-oriented and untestable in this repo's Node test environment.
 *
 * The token wiring (`--normal-bg`, `--border-radius`, …) is unchanged.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
