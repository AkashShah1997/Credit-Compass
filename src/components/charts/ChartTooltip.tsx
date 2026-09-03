import { SeriesDot } from '../ui/Badge'
import { formatCurrency } from '../../lib/format'

export interface TooltipItem {
  name?: string | number
  dataKey?: string | number
  value?: number | string | (number | string)[]
  color?: string
  /** Recharts hands the whole row back; used for extra context lines. */
  payload?: Record<string, unknown>
  /** Set by the caller to hide helper series (stack totals, baselines). */
  hide?: boolean
}

export interface ChartTooltipProps {
  active?: boolean
  payload?: readonly TooltipItem[]
  label?: unknown
  /** Overrides the default rupee formatting. */
  format?: (value: number) => string
  /** Optional line under the rows, e.g. a total or a share. */
  renderFooter?: (payload: readonly TooltipItem[]) => React.ReactNode
  labelFormatter?: (label: unknown) => string
  hiddenKeys?: string[]
}

/**
 * The hover layer every HTML chart ships by default. Rows carry a color key
 * beside the text — the text itself stays in ink tokens, never the series hue.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  format = (v) => formatCurrency(v),
  renderFooter,
  labelFormatter,
  hiddenKeys,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const rows = payload.filter(
    (item) => !hiddenKeys?.includes(String(item.dataKey)) && item.value != null,
  )
  if (!rows.length) return null

  return (
    <div className="pointer-events-none min-w-[168px] rounded-xl border border-hairline bg-surface px-3 py-2.5 shadow-pop">
      {label != null && label !== '' ? (
        <p className="mb-1.5 text-[12px] font-medium text-ink">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        {rows.map((item, index) => {
          const raw = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value
          const numeric = typeof raw === 'number' ? raw : Number(raw)
          return (
            <div key={`${item.dataKey}-${index}`} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
                {item.color ? <SeriesDot color={item.color} /> : null}
                {String(item.name ?? item.dataKey ?? '')}
              </span>
              <span className="tabular text-[12px] font-semibold text-ink">
                {Number.isFinite(numeric) ? format(numeric) : '—'}
              </span>
            </div>
          )
        })}
      </div>
      {renderFooter ? (
        <div className="mt-1.5 border-t border-hairline pt-1.5 text-[11.5px] text-muted">
          {renderFooter(rows)}
        </div>
      ) : null}
    </div>
  )
}
