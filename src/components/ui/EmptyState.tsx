import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
  compact,
}: {
  icon?: ReactNode
  title: string
  message?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline-strong text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
          {icon}
        </span>
      ) : null}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {message ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{message}</p> : null}
      </div>
      {action}
    </div>
  )
}
