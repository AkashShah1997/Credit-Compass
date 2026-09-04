import { Compass, X } from 'lucide-react'
import { NAV_ITEMS, type NavItem } from './nav'
import { cn } from '../../lib/cn'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { useAppState } from '../../store/AppStore'
import { scoreBand, scoreTrend } from '../../lib/credit'
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
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-150',
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

function SidebarContent({
  currentPath,
  onNavigate,
  onClose,
}: {
  currentPath: string
  onNavigate?: () => void
  onClose?: () => void
}) {
  const state = useAppState()
  const trend = scoreTrend(state.creditScores)
  const band = trend.latest ? scoreBand(trend.latest.score) : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <a href={hrefFor('/')} onClick={onNavigate} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-on-brand">
            <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
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

      <nav className="flex-1 px-3 pb-4">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} item={item} active={currentPath === item.path} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      <div className="border-t border-hairline px-3 py-3">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] text-muted">Latest score</p>
          {trend.latest && band ? (
            <>
              <p className="tabular mt-0.5 text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
                {trend.latest.score}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {band.label} · {trend.latest.bureau}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[12px] text-muted">Not logged yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  return (
    // Sticky rather than fixed: the shell is a flex row, so the sidebar keeps
    // its own scroll without the main column needing matching left padding.
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-hairline bg-surface lg:block">
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
      <div className="relative h-full w-[16rem] max-w-[85vw] animate-slide-in border-r border-hairline bg-surface shadow-modal">
        <SidebarContent currentPath={currentPath} onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  )
}
