import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bell, BellOff, CalendarClock, CreditCard, Info, OctagonAlert, PiggyBank, Target, Wallet } from 'lucide-react'
import type { AppNotification, NotificationKind, NotificationSeverity } from '../../types'
import { useActions, useAppState } from '../../store/AppStore'
import { buildNotifications } from '../../lib/finance'
import { formatCurrency } from '../../lib/format'
import { formatDate } from '../../lib/date'
import { useDismiss } from '../../hooks/useClickOutside'
import { cn } from '../../lib/cn'
import { IconButton } from '../ui/Button'

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  emi: CalendarClock,
  card: CreditCard,
  budget: Wallet,
  goal: PiggyBank,
  salary: Target,
  investment: Target,
}

const SEVERITY_STYLE: Record<NotificationSeverity, { icon: typeof Info; className: string; label: string }> = {
  critical: { icon: OctagonAlert, className: 'text-critical', label: 'Critical' },
  serious: { icon: AlertTriangle, className: 'text-serious', label: 'Urgent' },
  warning: { icon: AlertTriangle, className: 'text-warning', label: 'Warning' },
  info: { icon: Info, className: 'text-brand', label: 'Info' },
}

export function NotificationCenter() {
  const state = useAppState()
  const { dismissAlert, restoreAlerts } = useActions()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  useDismiss(container, open, () => setOpen(false))

  const notifications = useMemo(() => buildNotifications(state), [state])
  const urgent = notifications.filter((n) => n.severity === 'critical' || n.severity === 'serious').length

  return (
    <div className="relative" ref={container}>
      <IconButton
        label={`Notifications${notifications.length ? ` (${notifications.length} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {notifications.length > 0 ? (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
              urgent > 0 ? 'bg-critical' : 'bg-brand',
            )}
          >
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop-in overflow-hidden rounded-card border border-hairline bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Notifications</p>
              <p className="text-[12px] text-muted">
                {notifications.length ? `${notifications.length} need${notifications.length === 1 ? 's' : ''} attention` : 'You are all caught up'}
              </p>
            </div>
            {state.dismissedAlerts.length > 0 ? (
              <button
                type="button"
                onClick={restoreAlerts}
                className="text-[12px] font-medium text-brand hover:underline"
              >
                Restore
              </button>
            ) : null}
          </div>

          <div className="scrollbar-slim max-h-[min(26rem,60dvh)] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <BellOff className="h-6 w-6 text-muted" aria-hidden="true" />
                <p className="text-[13px] text-muted">No reminders right now.</p>
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onDismiss={() => dismissAlert(notification.id)}
                    onOpen={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NotificationRow({
  notification,
  onDismiss,
  onOpen,
}: {
  notification: AppNotification
  onDismiss: () => void
  onOpen: () => void
}) {
  const KindIcon = KIND_ICON[notification.kind]
  const severity = SEVERITY_STYLE[notification.severity]
  const SeverityIcon = severity.icon

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
        <KindIcon className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
      </span>
      <a
        href={notification.href ?? '#/'}
        onClick={onOpen}
        className="min-w-0 flex-1"
      >
        <span className="flex items-center gap-1.5">
          {/* Severity always ships icon + label — never hue alone. */}
          <SeverityIcon className={cn('h-3.5 w-3.5 shrink-0', severity.className)} aria-hidden="true" />
          <span className="sr-only">{severity.label}: </span>
          <span className="truncate text-[13px] font-medium text-ink">{notification.title}</span>
        </span>
        <span className="mt-0.5 block text-[12px] text-muted">{notification.detail}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
          {notification.amount != null ? (
            <span className="tabular font-medium text-ink-secondary">{formatCurrency(notification.amount)}</span>
          ) : null}
          {notification.date ? <span>{formatDate(notification.date)}</span> : null}
        </span>
      </a>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink"
      >
        Dismiss
      </button>
    </li>
  )
}
