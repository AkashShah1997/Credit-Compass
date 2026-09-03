import { useState, type ReactNode } from 'react'
import { Table2, LineChart as LineChartIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Card, CardHeader } from '../ui/Card'
import { SeriesDot } from '../ui/Badge'
import { TableWrap, Td, Th, Tr } from '../ui/Table'

export interface LegendItem {
  label: string
  color: string
  /** Rendered as a dashed key instead of a solid dot (projections, targets). */
  dashed?: boolean
}

export interface ChartTableView {
  columns: string[]
  rows: (string | number)[][]
  /** Column indexes to right-align (numeric columns). */
  numericFrom?: number
}

export interface ChartFrameProps {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  legend?: LegendItem[]
  /**
   * The same numbers in a table. Required whenever a chart leans on a
   * low-contrast hue — it is the relief the color validator asks for, and it is
   * how screen-reader and print users read the chart at all.
   */
  table?: ChartTableView
  height?: number
  footnote?: ReactNode
  children: ReactNode
  className?: string
  /** Rendered instead of the chart when there is nothing to plot. */
  empty?: ReactNode
}

export function ChartFrame({
  title,
  subtitle,
  action,
  legend,
  table,
  height = 260,
  footnote,
  children,
  className,
  empty,
}: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <>
            {action}
            {table ? (
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                aria-pressed={showTable}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {showTable ? <LineChartIcon className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                {showTable ? 'Chart' : 'Table'}
              </button>
            ) : null}
          </>
        }
      />

      {/* A legend is always present for two or more series — identity is never
          carried by color-matching alone. */}
      {legend && legend.length > 1 && !showTable ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
              {item.dashed ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-4 shrink-0 rounded-full"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 4px, transparent 4px 7px)`,
                  }}
                />
              ) : (
                <SeriesDot color={item.color} />
              )}
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {showTable && table ? (
        <div className="mt-3 min-h-0">
          <TableWrap>
            <thead>
              <tr>
                {table.columns.map((column, i) => (
                  <Th key={column} align={table.numericFrom != null && i >= table.numericFrom ? 'right' : 'left'}>
                    {column}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <Tr key={index}>
                  {row.map((cell, i) => (
                    <Td
                      key={i}
                      align={table.numericFrom != null && i >= table.numericFrom ? 'right' : 'left'}
                      className={i === 0 ? 'font-medium' : 'text-ink-secondary'}
                    >
                      {cell}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <div className="mt-3 min-w-0" style={{ height }}>
          {empty ?? children}
        </div>
      )}

      {footnote ? <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{footnote}</p> : null}
    </Card>
  )
}
