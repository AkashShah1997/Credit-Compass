import { cn } from '../../lib/cn'
import { formatCurrency, formatPercent } from '../../lib/format'
import { SeriesDot } from '../ui/Badge'

export interface CategoryBarItem {
  label: string
  value: number
  color: string
  /** Optional second line, e.g. "12 transactions". */
  meta?: string
  share?: number
}

/**
 * Ranked horizontal bars, drawn in plain HTML.
 *
 * Every row is directly labelled with its value, which is what lets the
 * low-contrast hues in the palette (aqua, yellow, magenta) be used on a light
 * surface at all — the number never depends on reading the bar.
 */
export function CategoryBars({
  items,
  max,
  onSelect,
  emptyLabel = 'Nothing to show yet',
  className,
}: {
  items: CategoryBarItem[]
  max?: number
  onSelect?: (item: CategoryBarItem) => void
  emptyLabel?: string
  className?: string
}) {
  if (!items.length) {
    return <p className="py-6 text-center text-[13px] text-muted">{emptyLabel}</p>
  }
  const ceiling = max ?? Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className={cn('flex flex-col', className)}>
      {items.map((item) => {
        const width = ceiling > 0 ? Math.max(2, (item.value / ceiling) * 100) : 0
        const Row = onSelect ? 'button' : 'div'
        return (
          <li key={item.label}>
            <Row
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(item) } : {})}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-lg px-2 py-2 text-left transition-colors',
                onSelect && 'hover:bg-surface-2',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-ink">
                  <SeriesDot color={item.color} />
                  <span className="truncate font-medium">{item.label}</span>
                  {item.share != null ? (
                    <span className="shrink-0 text-[11.5px] text-muted">{formatPercent(item.share, 0)}</span>
                  ) : null}
                </span>
                {/* Direct label — the value is never left to the bar alone. */}
                <span className="tabular shrink-0 text-[13px] font-semibold text-ink">
                  {formatCurrency(item.value)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${width}%`, backgroundColor: item.color }}
                />
              </div>
              {item.meta ? <span className="text-[11.5px] text-muted">{item.meta}</span> : null}
            </Row>
          </li>
        )
      })}
    </ul>
  )
}
