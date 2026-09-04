import { useEffect, useState, type ReactNode } from 'react'
import { Menu, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../store/ThemeProvider'
import { cn } from '../../lib/cn'
import { APP_NAME } from '../../lib/brand'
import { hrefFor } from '../../hooks/useRouter'
import { IconButton } from '../ui/Button'
import { NotificationCenter } from './NotificationCenter'
import { MobileDrawer, Sidebar } from './Sidebar'
import { NAV_ITEMS, navItemFor } from './nav'

export function AppShell({ currentPath, children }: { currentPath: string; children: ReactNode }) {
  const { mode, preference, setPreference } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => setDrawerOpen(false), [currentPath])

  const active = navItemFor(currentPath)
  const ThemeIcon = preference === 'system' ? Monitor : mode === 'dark' ? Moon : Sun
  const nextTheme = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light'

  return (
    <div className="min-h-dvh bg-page lg:flex lg:items-start">
      <Sidebar currentPath={currentPath} />
      <MobileDrawer open={drawerOpen} currentPath={currentPath} onClose={() => setDrawerOpen(false)} />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-hairline bg-page/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
            <IconButton label="Open menu" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
              <Menu className="h-[18px] w-[18px]" />
            </IconButton>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {active?.label ?? APP_NAME}
              </h1>
            </div>

            <IconButton
              label={`Theme: ${preference}. Switch to ${nextTheme}`}
              onClick={() => setPreference(nextTheme)}
            >
              <ThemeIcon className="h-[18px] w-[18px]" />
            </IconButton>

            <NotificationCenter />
          </div>
        </header>

        <main id="main-scroll" className="mx-auto max-w-5xl px-4 pt-5 pb-24 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileTabBar currentPath={currentPath} />
    </div>
  )
}

/** Three routes fit the bar exactly — no "More" needed. */
function MobileTabBar({ currentPath }: { currentPath: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = currentPath === item.path
          return (
            <a
              key={item.path}
              href={hrefFor(item.path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors',
                active ? 'text-brand' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
