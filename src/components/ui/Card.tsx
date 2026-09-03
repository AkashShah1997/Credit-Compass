import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps {
  children: ReactNode
  className?: string
  /** Turn padding off when the card hosts a full-bleed table or chart. */
  padded?: boolean
  as?: 'div' | 'section' | 'article'
}

export function Card({ children, className, padded = true, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-hairline bg-surface shadow-card',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

/** Page-level heading used at the top of every route. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  )
}
