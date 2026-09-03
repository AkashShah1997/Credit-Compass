import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react'
import { cn } from '../../lib/cn'

export type Tone = 'neutral' | 'brand' | 'good' | 'warning' | 'serious' | 'critical'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-secondary border-hairline',
  brand: 'bg-brand-soft text-brand-ink border-brand/20',
  good: 'bg-good-soft text-good border-good/25',
  warning: 'bg-warning-soft text-ink border-warning/35',
  serious: 'bg-serious-soft text-ink border-serious/35',
  critical: 'bg-critical-soft text-critical border-critical/25',
}

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone
  children: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

const STATUS_ICONS = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: AlertTriangle,
  critical: OctagonAlert,
  info: Info,
} as const

/**
 * Status is never carried by color alone — this always renders an icon and a
 * text label alongside the hue.
 */
export function StatusBadge({
  status,
  children,
  className,
}: {
  status: keyof typeof STATUS_ICONS
  children: ReactNode
  className?: string
}) {
  const Icon = STATUS_ICONS[status]
  const tone: Tone = status === 'info' ? 'brand' : status
  return (
    <Badge tone={tone} className={className} icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
      {children}
    </Badge>
  )
}

/** A color key that sits *beside* text, so labels never wear the data color. */
export function SeriesDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  )
}
