import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, type TooltipItem } from './ChartTooltip'
import { chartTheme } from '../../lib/palette'
import { useChartMode } from '../../store/ThemeProvider'
import { formatCompactCurrency, formatCurrency } from '../../lib/format'

export interface ColumnSeries {
  key: string
  label: string
  color: string
  /** Draw as a 2px line on top of the columns (e.g. a net or trend line). */
  asLine?: boolean
  /** Per-row override, used when a single series changes color by sign. */
  colorFor?: (row: Record<string, string | number>) => string
}

export interface ColumnChartProps {
  data: Record<string, string | number>[]
  xKey: string
  series: ColumnSeries[]
  stacked?: boolean
  format?: (value: number) => string
  yTickFormat?: (value: number) => string
  reference?: { value: number; label: string }
  renderTooltipFooter?: (payload: readonly TooltipItem[]) => React.ReactNode
  horizontal?: boolean
  /** Category label width when horizontal. */
  categoryWidth?: number
}

export function ColumnChart({
  data,
  xKey,
  series,
  stacked,
  format = formatCurrency,
  yTickFormat = formatCompactCurrency,
  reference,
  renderTooltipFooter,
  horizontal,
  categoryWidth = 92,
}: ColumnChartProps) {
  const theme = chartTheme(useChartMode())
  const stackId = stacked ? 'stack' : undefined
  const lastBarIndex = series.map((s) => Boolean(s.asLine)).lastIndexOf(false)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 0 : -8 }}
        barGap={2}
        barCategoryGap={horizontal ? '22%' : '28%'}
      >
        <CartesianGrid
          stroke={theme.grid}
          strokeWidth={1}
          vertical={Boolean(horizontal)}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={{ fill: theme.tick, fontSize: 11 }}
              tickFormatter={yTickFormat}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tickLine={false}
              axisLine={{ stroke: theme.axis }}
              tick={{ fill: theme.label, fontSize: 11 }}
              width={categoryWidth}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={{ stroke: theme.axis }}
              tick={{ fill: theme.tick, fontSize: 11 }}
              tickMargin={8}
              minTickGap={4}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: theme.tick, fontSize: 11 }}
              tickFormatter={yTickFormat}
              width={56}
            />
          </>
        )}
        <Tooltip
          cursor={{ fill: theme.grid, fillOpacity: 0.45 }}
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as unknown as readonly TooltipItem[]}
              label={props.label}
              format={format}
              renderFooter={renderTooltipFooter}
            />
          )}
        />
        {reference ? (
          <ReferenceLine
            {...(horizontal ? { x: reference.value } : { y: reference.value })}
            stroke={theme.axis}
            strokeDasharray="4 4"
            label={{ value: reference.label, position: 'insideTopLeft', fill: theme.tick, fontSize: 11 }}
          />
        ) : null}

        {series.map((s, index) =>
          s.asLine ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: theme.gap, fill: s.color }}
              isAnimationActive={false}
            />
          ) : (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stackId}
              fill={s.color}
              // Cap the mark and let the band's leftover be air.
              maxBarSize={24}
              // 4px rounded data-end, square at the baseline. In a stack only the
              // outermost segment gets the rounding.
              radius={
                horizontal
                  ? stacked && index !== lastBarIndex
                    ? 0
                    : [0, 4, 4, 0]
                  : stacked && index !== lastBarIndex
                    ? 0
                    : [4, 4, 0, 0]
              }
              // The 2px surface stroke *is* the gap between touching segments —
              // it separates with white, it is not a border drawn on the mark.
              stroke={stacked ? theme.gap : undefined}
              strokeWidth={stacked ? 2 : 0}
              isAnimationActive={false}
            >
              {s.colorFor
                ? data.map((row, i) => <Cell key={i} fill={s.colorFor?.(row)} />)
                : null}
            </Bar>
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
