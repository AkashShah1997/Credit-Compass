import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-hairline-strong hover:bg-surface-2',
  soft: 'bg-surface-2 text-ink hover:bg-surface-3',
  ghost: 'text-ink-secondary hover:bg-surface-2 hover:text-ink',
  danger: 'bg-critical text-white hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconEnd?: ReactNode
  block?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  block,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
      {iconEnd}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: Variant
  size?: Size
}

export function IconButton({ label, variant = 'ghost', size = 'md', className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
        className,
      )}
    >
      {children}
    </button>
  )
}
