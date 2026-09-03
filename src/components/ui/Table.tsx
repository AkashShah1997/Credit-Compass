import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  // Wide tables scroll inside their own container — the page body never does.
  return (
    <div className={cn('scrollbar-slim -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
  className,
  ...props
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        'border-b border-hairline px-3 py-2.5 text-[12px] font-medium whitespace-nowrap text-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className,
  ...props
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...props}
      className={cn(
        'border-b border-hairline px-3 py-3 text-ink',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Tr({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr {...props} className={cn('transition-colors hover:bg-surface-2', className)}>
      {children}
    </tr>
  )
}
