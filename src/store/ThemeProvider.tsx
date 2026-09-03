/**
 * Theme.
 *
 * The user's preference lives in app settings (so it exports with a backup),
 * but it's mirrored into a standalone localStorage key that the inline script
 * in index.html reads before first paint — without that mirror, every reload
 * flashes light before React boots.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemePreference } from '../types'
import { THEME_KEY } from '../lib/storage'
import { useActions, useAppState } from './AppStore'
import type { Mode } from '../lib/palette'

interface ThemeContextValue {
  preference: ThemePreference
  /** The mode actually on screen — `system` already resolved. */
  mode: Mode
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemMode(): Mode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useAppState()
  const { updateSettings } = useActions()
  const preference = settings.theme
  const [systemPref, setSystemPref] = useState<Mode>(systemMode)

  // Track the OS setting so `system` follows it live, not just on load.
  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => setSystemPref(event.matches ? 'dark' : 'light')
    query.addEventListener('change', handler)
    return () => query.removeEventListener('change', handler)
  }, [])

  const mode: Mode = preference === 'system' ? systemPref : preference

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', mode)
    root.style.colorScheme = mode
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'dark' ? '#0a0c10' : '#f6f7f9')
    try {
      window.localStorage.setItem(THEME_KEY, preference)
    } catch {
      /* private mode — the in-memory value still drives this session */
    }
  }, [mode, preference])

  const setPreference = useCallback(
    (next: ThemePreference) => updateSettings({ theme: next }),
    [updateSettings],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      mode,
      setPreference,
      toggle: () => setPreference(mode === 'dark' ? 'light' : 'dark'),
    }),
    [preference, mode, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}

/** Chart components only need the resolved mode. */
export function useChartMode(): Mode {
  return useTheme().mode
}
