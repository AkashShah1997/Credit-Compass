import { Sparkles, X } from 'lucide-react'
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from './nav'
import { cn } from '../../lib/cn'
import { useAppState } from '../../store/AppStore'
import { netWorthBreakdown } from '../../lib/finance'
import { formatCompactCurrency } from '../../lib/format'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { hrefFor } from '../../hooks/useRouter'
import { IconButton } from '../ui/Button'

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <a
      href={hrefFor(item.path)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors duration-150',
        active ? 'bg-brand-soft text-brand-ink' : 'text-ink-secondary hover:bg-surface-2 hover:text-ink',
      )}
    >
      {active ? (
        <span aria-hidden="true" className="absolute top-1/2 -left-2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand" />
      ) : null}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </a>
  )
}

export function SidebarContent({
  currentPath,
  onNavigate,
  onClose,
}: {
  currentPath: string
  onNavigate?: () => void
  onClose?: () => void
}) {
  const state = useAppState()
  const worth = netWorthBreakdown(state)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <a href={hrefFor('/')} onClick={onNavigate} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-on-brand">
            <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[15px] leading-tight font-semibold tracking-[-0.02em] text-ink">{APP_NAME}</span>
            <span className="block text-[11px] leading-tight text-muted">{APP_TAGLINE}</span>
          </span>
        </a>
        {onClose ? (
          <IconButton label="Close menu" onClick={onClose} size="sm" className="lg:hidden">
            <X className="h-4 w-4" />
          </IconButton>
        ) : null}
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.path} item={item} active={currentPath === item.path} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline px-3 py-3">
        <NavLink item={SETTINGS_ITEM} active={currentPath === SETTINGS_ITEM.path} onNavigate={onNavigate} />
        <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] text-muted">Net worth</p>
          <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {formatCompactCurrency(worth.netWorth)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {formatCompactCurrency(worth.totalAssets)} assets · {formatCompactCurrency(worth.totalLiabilities)} owed
          </p>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  return (
    // Sticky rather than fixed: the shell is a flex row, so the sidebar keeps
    // its own scroll without the main column needing a matching left padding.
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-hairline bg-surface lg:block">
      <SidebarContent currentPath={currentPath} />
    </aside>
  )
}

export function MobileDrawer({
  open,
  currentPath,
  onClose,
}: {
  open: boolean
  currentPath: string
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} aria-hidden="true" />
      <div className="relative h-full w-[17rem] max-w-[85vw] animate-slide-in border-r border-hairline bg-surface shadow-modal">
        <SidebarContent currentPath={currentPath} onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  )
}
