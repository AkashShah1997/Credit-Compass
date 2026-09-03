import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

/** Segmented control — the filter row that sits above a chart or list. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-hairline bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition-colors duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              active
                ? 'bg-surface text-ink shadow-card'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Underlined tabs for switching page sections. */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  className?: string
}) {
  return (
    <div className={cn('scrollbar-slim flex gap-1 overflow-x-auto border-b border-hairline', className)} role="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:border-hairline-strong hover:text-ink',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
