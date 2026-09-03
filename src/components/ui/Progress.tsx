import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { STATUS_COLORS, type StatusTone } from '../../lib/palette'

export type MeterTone = StatusTone | 'brand'

const FILL: Record<MeterTone, string> = {
  brand: 'var(--c-brand)',
  good: STATUS_COLORS.good,
  warning: STATUS_COLORS.warning,
  serious: STATUS_COLORS.serious,
  critical: STATUS_COLORS.critical,
}

export interface ProgressBarProps {
  value: number
  tone?: MeterTone
  /** Height in pixels; the default reads as a data mark, not a divider. */
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
  /** A second, lighter mark behind the fill — e.g. "where you should be". */
  marker?: number
}

/**
 * Meter. The fill carries severity; the track is a translucent step of the
 * same hue so the state reads across the whole bar, not just the filled part.
 */
export function ProgressBar({ value, tone = 'brand', size = 'md', label, className, marker }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value))
  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2'
  const color = FILL[tone]

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-full', height, className)}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {marker != null && marker > 0 && marker < 100 ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 rounded-full bg-ink/35"
          style={{ left: `${Math.min(100, marker)}%` }}
        />
      ) : null}
    </div>
  )
}

/** Labelled meter row: name on the left, figures on the right, bar underneath. */
export function MeterRow({
  label,
  value,
  right,
  tone = 'brand',
  sub,
  icon,
  onClick,
}: {
  label: ReactNode
  value: number
  right?: ReactNode
  tone?: MeterTone
  sub?: ReactNode
  icon?: ReactNode
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl p-2.5 text-left transition-colors',
        onClick && 'hover:bg-surface-2',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {right ? <span className="tabular shrink-0 text-[13px] text-ink-secondary">{right}</span> : null}
      </div>
      <ProgressBar value={value} tone={tone} />
      {sub ? <div className="text-[12px] text-muted">{sub}</div> : null}
    </Wrapper>
  )
}

/**
 * Ring progress for a single headline percentage (emergency fund, FI progress).
 * The value is always printed in the middle — the arc alone is never the label.
 */
export function RingProgress({
  value,
  size = 132,
  thickness = 10,
  tone = 'brand',
  children,
}: {
  value: number
  size?: number
  thickness?: number
  tone?: MeterTone
  children?: ReactNode
}) {
  const pct = Math.max(0, Math.min(100, value))
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const color = FILL[tone]

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          style={{ stroke: `color-mix(in oklab, ${color} 16%, transparent)` }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
