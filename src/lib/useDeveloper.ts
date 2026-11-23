import { useCallback, useEffect, useState } from 'react'
import { readDeveloper, subscribeDeveloper, writeDeveloper } from './developer'

/**
 * Reactive access to the developer-mode preference.
 *
 * The initial value is read **synchronously** from storage rather than in an
 * effect: a caption that painted plain and then flipped to a wire path (or the
 * other way round) on mount would be a flash of the wrong app, the same reason
 * the theme is applied before first paint.
 *
 * Every panel reads it through `useSyncExternalStore`-style subscription on the
 * same module store, so toggling in the top bar relabels the page in place —
 * no reload, and no second copy of the preference in React state.
 */
export function useDeveloperMode(): {
  developer: boolean
  setDeveloper: (on: boolean) => void
  toggle: () => void
} {
  const [developer, setLocal] = useState<boolean>(() => readDeveloper())

  useEffect(() => {
    setLocal(readDeveloper())
    return subscribeDeveloper(() => setLocal(readDeveloper()))
  }, [])

  const setDeveloper = useCallback((on: boolean) => {
    writeDeveloper(on)
    setLocal(on)
  }, [])

  const toggle = useCallback(() => {
    setLocal((current) => {
      const next = !current
      writeDeveloper(next)
      return next
    })
  }, [])

  return { developer, setDeveloper, toggle }
}

/** Just the flag, for a component that only reads it. */
export function useDeveloper(): boolean {
  return useDeveloperMode().developer
}
