import {
  Area,
  CartesianGrid,
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

export interface TrendSeries {
  key: string
  label: string
  color: string
  /** `area` gets a 10%-opacity wash under a 2px line; `line` is the line alone. */
  kind?: 'area' | 'line'
  dashed?: boolean
}

export interface TrendChartProps {
  data: Record<string, string | number>[]
  xKey: string
  series: TrendSeries[]
  format?: (value: number) => string
  yTickFormat?: (value: number) => string
  /** Horizontal marker, e.g. an average or a target. */
  reference?: { value: number; label: string }
  /** Extra tooltip line, e.g. "Net +$1,240". */
  renderTooltipFooter?: (payload: readonly TooltipItem[]) => React.ReactNode
  stacked?: boolean
}

export function TrendChart({
  data,
  xKey,
  series,
  format = formatCurrency,
  yTickFormat = formatCompactCurrency,
  reference,
  renderTooltipFooter,
  stacked,
}: TrendChartProps) {
  const theme = chartTheme(useChartMode())

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        {/* Hairline, solid, horizontal only — the grid stays recessive. */}
        <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={{ stroke: theme.axis }}
          tick={{ fill: theme.tick, fontSize: 11 }}
          tickMargin={8}
          minTickGap={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: theme.tick, fontSize: 11 }}
          tickFormatter={yTickFormat}
          width={56}
        />
        <Tooltip
          cursor={{ stroke: theme.axis, strokeWidth: 1 }}
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
            y={reference.value}
            stroke={theme.axis}
            strokeDasharray="4 4"
            label={{
              value: reference.label,
              position: 'insideTopLeft',
              fill: theme.tick,
              fontSize: 11,
            }}
          />
        ) : null}

        {series.map((s) =>
          s.kind === 'line' ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              // 2px surface ring so the marker stays legible over the line.
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: theme.gap, fill: s.color }}
              // Charts redraw on every filter and theme change; a draw-in
              // animation each time reads as lag, not polish.
              isAnimationActive={false}
            />
          ) : (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'stack' : undefined}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={s.color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: theme.gap, fill: s.color }}
              isAnimationActive={false}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
