import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, currentMonthKey, monthLabel } from '../../lib/date'
import { cn } from '../../lib/cn'

/**
 * Month stepper. Stops at the current month — you cannot budget or report on a
 * month that hasn't happened, and letting the arrow run into the future just
 * shows empty charts.
 */
export function MonthPicker({
  value,
  onChange,
  className,
  allowFuture = false,
  minMonth,
}: {
  value: string
  onChange: (month: string) => void
  className?: string
  allowFuture?: boolean
  minMonth?: string
}) {
  const atMax = !allowFuture && value >= currentMonthKey()
  const atMin = minMonth ? value <= minMonth : false

  return (
    <div
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-xl border border-hairline bg-surface',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(addMonths(value, -1))}
        disabled={atMin}
        aria-label="Previous month"
        className="flex h-full w-8 items-center justify-center rounded-l-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[6.5rem] px-1 text-center text-[13px] font-medium text-ink">
        {monthLabel(value)}
      </span>
      <button
        type="button"
        onClick={() => onChange(addMonths(value, 1))}
        disabled={atMax}
        aria-label="Next month"
        className="flex h-full w-8 items-center justify-center rounded-r-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
