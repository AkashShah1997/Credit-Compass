import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { Category, PaymentMethod, Transaction, TransactionType } from '../../types'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from '../../types'
import { useActions } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { CurrencyInput, Field, SelectInput, TextInput } from '../ui/Field'
import { todayISO } from '../../lib/date'
import { formatCurrency } from '../../lib/format'
import { cn } from '../../lib/cn'

export interface TransactionFormModalProps {
  open: boolean
  onClose: () => void
  /** Pass an existing row to edit it; omit to create a new one. */
  transaction?: Transaction | null
  defaultType?: TransactionType
  defaultCategory?: Category
}

interface FormState {
  type: TransactionType
  amount: string
  category: Category
  date: string
  note: string
  method: PaymentMethod
}

function initialState(transaction: Transaction | null | undefined, defaults: { type: TransactionType; category?: Category }): FormState {
  if (transaction) {
    return {
      type: transaction.type,
      amount: String(transaction.amount),
      category: transaction.category,
      date: transaction.date,
      note: transaction.note,
      method: transaction.method,
    }
  }
  return {
    type: defaults.type,
    amount: '',
    category: defaults.category ?? (defaults.type === 'income' ? 'Salary' : 'Food & Dining'),
    date: todayISO(),
    note: '',
    method: defaults.type === 'income' ? 'Bank Transfer' : 'Debit',
  }
}

export function TransactionFormModal({
  open,
  onClose,
  transaction,
  defaultType = 'expense',
  defaultCategory,
}: TransactionFormModalProps) {
  const { addTransaction, updateTransaction } = useActions()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => initialState(transaction, { type: defaultType, category: defaultCategory }))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  // Re-seed whenever the modal opens so an edit never shows the last row's data.
  useEffect(() => {
    if (open) {
      setForm(initialState(transaction, { type: defaultType, category: defaultCategory }))
      setErrors({})
    }
  }, [open, transaction, defaultType, defaultCategory])

  const categories = useMemo<readonly Category[]>(
    () => (form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
    [form.type],
  )

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const switchType = (type: TransactionType) => {
    const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    setForm((prev) => ({
      ...prev,
      type,
      // The category lists barely overlap, so reset unless the name carries over.
      category: (list as readonly Category[]).includes(prev.category) ? prev.category : list[0],
      method: type === 'income' ? 'Bank Transfer' : prev.method,
    }))
  }

  const submit = () => {
    const amount = Number(form.amount)
    const nextErrors: Partial<Record<keyof FormState, string>> = {}
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      nextErrors.amount = 'Enter an amount greater than zero'
    }
    if (!form.date) nextErrors.date = 'Pick a date'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const payload = {
      type: form.type,
      amount: Math.round(amount * 100) / 100,
      category: form.category,
      date: form.date,
      note: form.note.trim() || form.category,
      method: form.method,
    }

    if (transaction) {
      updateTransaction(transaction.id, payload)
      toast.success('Transaction updated')
    } else {
      addTransaction(payload)
      toast.success(
        `${form.type === 'income' ? 'Income' : 'Expense'} of ${formatCurrency(payload.amount)} added`,
      )
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      description={transaction ? 'Update the details below.' : 'Record money coming in or going out.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {transaction ? 'Save changes' : 'Add transaction'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {(['expense', 'income'] as const).map((type) => {
            const active = form.type === type
            const Icon = type === 'income' ? ArrowDownLeft : ArrowUpRight
            return (
              <button
                key={type}
                type="button"
                onClick={() => switchType(type)}
                aria-pressed={active}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-hairline text-ink-secondary hover:bg-surface-2',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {type === 'income' ? 'Income' : 'Expense'}
              </button>
            )
          })}
        </div>

        <Field label="Amount" required error={errors.amount}>
          {(id) => (
            <CurrencyInput
              id={id}
              autoFocus
              value={form.amount}
              placeholder="0"
              invalid={Boolean(errors.amount)}
              onChange={(event) => set('amount', event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            {(id) => (
              <SelectInput id={id} value={form.category} onChange={(event) => set('category', event.target.value as Category)}>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>

          <Field label="Date" required error={errors.date}>
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={form.date}
                max={todayISO()}
                invalid={Boolean(errors.date)}
                onChange={(event) => set('date', event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Payment method">
          {(id) => (
            <SelectInput id={id} value={form.method} onChange={(event) => set('method', event.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>

        <Field label="Note" hint="Optional — defaults to the category name">
          {(id) => (
            <TextInput
              id={id}
              value={form.note}
              placeholder="e.g. Groceries at No Frills"
              maxLength={80}
              onChange={(event) => set('note', event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
