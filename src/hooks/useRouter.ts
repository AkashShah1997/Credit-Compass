/**
 * Minimal hash router.
 *
 * Hash routing keeps the app a single static file that works from any path —
 * no server rewrite rules, no dependency. Routes are flat (`#/transactions`)
 * with an optional query string for deep links (`#/transactions?category=Food`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

export interface Route {
  path: string
  query: URLSearchParams
}

function readHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, search = ''] = raw.split('?')
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(search) }
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? { path: '/', query: new URLSearchParams() } : readHash(),
  )

  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onChange)
    if (!window.location.hash) window.location.replace('#/')
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path: string, query?: Record<string, string>) => {
    const search = query ? `?${new URLSearchParams(query).toString()}` : ''
    const next = `#${path.startsWith('/') ? path : `/${path}`}${search}`
    if (window.location.hash === next) {
      // Same target: re-emit so a page can still reset its own view state.
      setRoute(readHash())
      return
    }
    window.location.hash = next
  }, [])

  // The list scrolls, not the window, so reset both on navigation.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.getElementById('main-scroll')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [route.path])

  return useMemo(() => ({ ...route, navigate }), [route, navigate])
}

export function hrefFor(path: string, query?: Record<string, string>): string {
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  return `#${path.startsWith('/') ? path : `/${path}`}${search}`
}
