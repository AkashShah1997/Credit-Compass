import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatSignedPercent } from '../../lib/format'

export interface StatTileProps {
  label: string
  value: ReactNode
  /** Secondary line under the value — a note, not a second metric. */
  sub?: ReactNode
  /** Percentage change; sign carries direction, `upIsGood` carries meaning. */
  delta?: number | null
  deltaLabel?: string
  upIsGood?: boolean
  icon?: ReactNode
  /** 8–14 points; renders a de-emphasised sparkline behind nothing, beside all. */
  trend?: number[]
  trendColor?: string
  accent?: string
  onClick?: () => void
  className?: string
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaLabel = 'vs last month',
  upIsGood = true,
  icon,
  trend,
  trendColor,
  accent,
  onClick,
  className,
}: StatTileProps) {
  const Wrapper = onClick ? 'button' : 'div'
  const isGood = delta == null ? null : delta === 0 ? null : delta > 0 === upIsGood
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-card border border-hairline bg-surface p-4 text-left shadow-card sm:p-5',
        onClick && 'transition-colors hover:border-hairline-strong hover:bg-surface-2',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={
              accent
                ? { backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }
                : undefined
            }
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div>
        {/* Proportional figures on purpose: tabular-nums looks loose at this size. */}
        <p className="text-[26px] leading-none font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
          {value}
        </p>
        {sub ? <p className="mt-2 text-[12.5px] text-ink-secondary">{sub}</p> : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        {delta != null ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[12.5px] font-medium',
              isGood === null ? 'text-muted' : isGood ? 'text-positive' : 'text-negative',
            )}
          >
            <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {formatSignedPercent(delta)}
            <span className="font-normal text-muted">{deltaLabel}</span>
          </span>
        ) : (
          <span />
        )}
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} color={trendColor ?? accent} className="shrink-0" />
        ) : null}
      </div>
    </Wrapper>
  )
}

export function Sparkline({
  values,
  color,
  width = 76,
  height = 26,
  className,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
  className?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => [i * step, height - ((v - min) / span) * (height - 4) - 2] as const)
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]
  const stroke = color ?? 'var(--c-brand)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      // The chart is decorative here; the number beside it carries the value.
      focusable="false"
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      {/* 2px surface ring keeps the end-dot legible where it overlaps the line. */}
      <circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke="var(--c-surface)" strokeWidth={2} />
    </svg>
  )
}
