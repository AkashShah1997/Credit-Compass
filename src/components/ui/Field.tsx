import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { CURRENCY_SYMBOL } from '../../lib/format'

const CONTROL =
  'w-full rounded-xl border border-hairline-strong bg-surface px-3 text-sm text-ink placeholder:text-muted ' +
  'transition-colors duration-150 hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  children: (id: string) => ReactNode
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-secondary">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="text-[12px] font-medium text-critical">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** Static adornment in the left gutter (not the HTML `prefix` attribute). */
  leading?: ReactNode
}

export function TextInput({ className, invalid, leading, ...props }: TextInputProps) {
  if (leading) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
          {leading}
        </span>
        <input
          {...props}
          className={cn(CONTROL, 'h-10 pl-8', invalid && 'border-critical focus:ring-critical/25', className)}
        />
      </div>
    )
  }
  return (
    <input
      {...props}
      className={cn(CONTROL, 'h-10', invalid && 'border-critical focus:ring-critical/25', className)}
    />
  )
}

/** Amount input: numeric keypad on mobile, dollar sign in the gutter. */
export function CurrencyInput({ className, invalid, ...props }: TextInputProps) {
  return (
    <TextInput
      type="number"
      inputMode="decimal"
      min={0}
      step="1"
      leading={CURRENCY_SYMBOL}
      invalid={invalid}
      className={cn('tabular', className)}
      {...props}
    />
  )
}

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function SelectInput({ className, invalid, children, ...props }: SelectInputProps) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          CONTROL,
          'h-10 cursor-pointer appearance-none pr-9',
          invalid && 'border-critical focus:ring-critical/25',
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, 'min-h-20 resize-y py-2.5', className)} />
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[12px] text-muted">{description}</span> : null}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}
