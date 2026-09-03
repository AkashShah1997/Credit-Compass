import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartTooltip, type TooltipItem } from './ChartTooltip'
import { chartTheme } from '../../lib/palette'
import { useChartMode } from '../../store/ThemeProvider'
import { formatCurrency } from '../../lib/format'

export interface DonutSlice {
  name: string
  value: number
  color: string
}

/**
 * Part-to-whole for a handful of slices. The centre carries the total as a
 * hero figure, so the ring never has to be read by angle alone; the legend and
 * table view beside it carry per-slice identity.
 */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  format = formatCurrency,
  thickness = 26,
}: {
  data: DonutSlice[]
  centerLabel?: string
  centerValue?: string
  format?: (value: number) => string
  thickness?: number
}) {
  const theme = chartTheme(useChartMode())
  const total = data.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as unknown as readonly TooltipItem[]}
                format={format}
                renderFooter={(payload) => {
                  const raw = payload[0]?.value
                  const value = typeof raw === 'number' ? raw : Number(raw)
                  return total > 0 && Number.isFinite(value)
                    ? `${((value / total) * 100).toFixed(1)}% of total`
                    : null
                }}
              />
            )}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={`${Math.max(40, 72 - thickness)}%`}
            outerRadius="90%"
            // The 2px surface stroke is the gap that separates touching arcs.
            stroke={theme.gap}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {centerValue ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel ? <span className="text-[11.5px] text-muted">{centerLabel}</span> : null}
          <span className="text-lg font-semibold tracking-[-0.02em] text-ink">{centerValue}</span>
        </div>
      ) : null}
    </div>
  )
}
