import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Menu, Monitor, Moon, MoreHorizontal, Plus, Search, Sun } from 'lucide-react'
import type { Category, Transaction, TransactionType } from '../../types'
import { useAppState } from '../../store/AppStore'
import { useTheme } from '../../store/ThemeProvider'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'
import { APP_INITIALS, APP_NAME } from '../../lib/brand'
import { hrefFor } from '../../hooks/useRouter'
import { Button, IconButton } from '../ui/Button'
import { NotificationCenter } from './NotificationCenter'
import { GlobalSearch } from './GlobalSearch'
import { MobileDrawer, Sidebar } from './Sidebar'
import { MOBILE_PRIMARY, ALL_NAV_ITEMS, navItemFor } from './nav'
import { TransactionFormModal } from '../forms/TransactionForm'

/* -------------------------------------------------------------------------- */
/* Quick-add: one transaction modal, reachable from anywhere                  */
/* -------------------------------------------------------------------------- */

interface QuickAddApi {
  addTransaction: (options?: { type?: TransactionType; category?: Category }) => void
  editTransaction: (transaction: Transaction) => void
  openSearch: () => void
}

const QuickAddContext = createContext<QuickAddApi | null>(null)

export function useQuickAdd(): QuickAddApi {
  const api = useContext(QuickAddContext)
  if (!api) throw new Error('useQuickAdd must be used inside <AppShell>')
  return api
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function AppShell({ currentPath, children }: { currentPath: string; children: ReactNode }) {
  const { settings } = useAppState()
  const { mode, preference, setPreference } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [txnModal, setTxnModal] = useState<{
    open: boolean
    transaction?: Transaction | null
    type?: TransactionType
    category?: Category
  }>({ open: false })

  const api = useMemo<QuickAddApi>(
    () => ({
      addTransaction: (options) =>
        setTxnModal({ open: true, transaction: null, type: options?.type, category: options?.category }),
      editTransaction: (transaction) => setTxnModal({ open: true, transaction }),
      openSearch: () => setSearchOpen(true),
    }),
    [],
  )

  // ⌘K / Ctrl-K opens search from any page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => setDrawerOpen(false), [currentPath])

  const active = navItemFor(currentPath)
  const ThemeIcon = preference === 'system' ? Monitor : mode === 'dark' ? Moon : Sun
  const nextTheme = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light'

  return (
    <QuickAddContext.Provider value={api}>
      <div className="min-h-dvh bg-page lg:flex lg:items-start">
        <Sidebar currentPath={currentPath} />
        <MobileDrawer open={drawerOpen} currentPath={currentPath} onClose={() => setDrawerOpen(false)} />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-hairline bg-page/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-2 px-4 sm:px-6">
              <IconButton label="Open menu" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
                <Menu className="h-[18px] w-[18px]" />
              </IconButton>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {active?.label ?? APP_NAME}
                </h1>
              </div>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 items-center gap-2 rounded-xl border border-hairline bg-surface px-3 text-[13px] text-muted transition-colors hover:border-hairline-strong hover:text-ink md:flex"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Search…</span>
                <kbd className="ml-4 rounded border border-hairline bg-surface-2 px-1.5 py-0.5 font-sans text-[10.5px] text-muted">
                  ⌘K
                </kbd>
              </button>

              <IconButton label="Search" className="md:hidden" onClick={() => setSearchOpen(true)}>
                <Search className="h-[18px] w-[18px]" />
              </IconButton>

              <IconButton
                label={`Theme: ${preference}. Switch to ${nextTheme}`}
                onClick={() => setPreference(nextTheme)}
              >
                <ThemeIcon className="h-[18px] w-[18px]" />
              </IconButton>

              <NotificationCenter />

              <Button
                variant="primary"
                size="sm"
                className="hidden sm:inline-flex"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => api.addTransaction()}
              >
                Add
              </Button>

              <a
                href={hrefFor('/settings')}
                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-ink"
                aria-label="Settings and profile"
                title={settings.name}
              >
                {initials(settings.name) || APP_INITIALS}
              </a>
            </div>
          </header>

          <main id="main-scroll" className="mx-auto max-w-[88rem] px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
            {children}
          </main>
        </div>

        <MobileTabBar
          currentPath={currentPath}
          onMore={() => setDrawerOpen(true)}
          onAdd={() => api.addTransaction()}
        />

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <TransactionFormModal
          open={txnModal.open}
          transaction={txnModal.transaction}
          defaultType={txnModal.type}
          defaultCategory={txnModal.category}
          onClose={() => setTxnModal({ open: false })}
        />
      </div>
    </QuickAddContext.Provider>
  )
}

function MobileTabBar({
  currentPath,
  onMore,
  onAdd,
}: {
  currentPath: string
  onMore: () => void
  onAdd: () => void
}) {
  const items = useMemo(
    () => MOBILE_PRIMARY.map((path) => ALL_NAV_ITEMS.find((item) => item.path === path)!).filter(Boolean),
    [],
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {items.slice(0, 2).map((item) => (
          <TabLink key={item.path} path={item.path} label={item.short ?? item.label} icon={item.icon} active={currentPath === item.path} />
        ))}

        <button
          type="button"
          onClick={onAdd}
          className="relative -mt-4 flex flex-col items-center justify-center px-3"
          aria-label="Add transaction"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-on-brand shadow-pop">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
        </button>

        {items.slice(2).map((item) => (
          <TabLink key={item.path} path={item.path} label={item.short ?? item.label} icon={item.icon} active={currentPath === item.path} />
        ))}

        <button
          type="button"
          onClick={onMore}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-muted transition-colors hover:text-ink"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          More
        </button>
      </div>
    </nav>
  )
}

function TabLink({
  path,
  label,
  icon: Icon,
  active,
}: {
  path: string
  label: string
  icon: typeof Search
  active: boolean
}) {
  return (
    <a
      href={hrefFor(path)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors',
        active ? 'text-brand' : 'text-muted hover:text-ink',
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </a>
  )
}
