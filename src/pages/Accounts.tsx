/**
 * Accounts — the things the credit page reasons about.
 *
 * Entered once and then largely left alone. Only the balance moves month to
 * month, and there is a shortcut for that on the home page, so this screen is
 * deliberately quiet: it exists for the first setup and the occasional change.
 */

import { useMemo, useState } from 'react'
import { CreditCard, Landmark, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { AccountKind, CreditAccount, Debt, DebtKind } from '../types'
import { ACCOUNT_KINDS, DEBT_KINDS } from '../types'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import { UTILISATION_HEALTHY, UTILISATION_IDEAL, accountUtilisation, inquirySummary } from '../lib/credit'
import { formatDate, monthsSince, todayISO } from '../lib/date'
import { formatCurrency, formatPercent, formatTenure, ordinal } from '../lib/format'
import { seriesColor } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { ProgressBar } from '../components/ui/Progress'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { CurrencyInput, Field, SelectInput, TextInput } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'

type Editing =
  | { kind: 'account'; entry?: CreditAccount }
  | { kind: 'debt'; entry?: Debt }
  | { kind: 'inquiry' }

type Removing =
  | { kind: 'account'; id: string; label: string }
  | { kind: 'debt'; id: string; label: string }
  | { kind: 'inquiry'; id: string; label: string }

export default function Accounts() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()

  const [editing, setEditing] = useState<Editing | null>(null)
  const [removing, setRemoving] = useState<Removing | null>(null)

  const inquiries = useMemo(() => inquirySummary(state.inquiries), [state.inquiries])

  function confirmRemove() {
    if (!removing) return
    if (removing.kind === 'account') actions.removeAccount(removing.id)
    if (removing.kind === 'debt') actions.removeDebt(removing.id)
    if (removing.kind === 'inquiry') actions.removeInquiry(removing.id)
    toast.success(`${removing.label} removed.`)
    setRemoving(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        subtitle="What the credit page works from. Set it once — only the balance changes month to month."
      />

      {/* Revolving --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Cards & lines of credit"
          subtitle={
            state.accounts.length
              ? `${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'} · these drive utilization`
              : 'These drive utilization — the fastest lever on your score'
          }
          icon={<CreditCard className="h-4 w-4" />}
          action={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ kind: 'account' })}>
              Add
            </Button>
          }
        />

        {state.accounts.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<CreditCard className="h-5 w-5" />}
            title="No cards yet"
            message="Add every credit card and line of credit you have. Four fields each — name, limit, balance and the day your statement closes."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ kind: 'account' })}>
                Add a card
              </Button>
            }
          />
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-hairline">
            {state.accounts.map((account, index) => {
              const util = accountUtilisation(account)
              const color = seriesColor(index, mode)
              return (
                <li key={account.id} className="py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
                      >
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{account.name}</p>
                        <p className="mt-0.5 truncate text-[12px] text-muted">
                          {account.kind} · closes {ordinal(account.statementDay)}
                          {account.apr != null ? ` · ${formatPercent(account.apr, 2)} APR` : ''}
                          {account.openedDate ? ` · ${formatTenure(monthsSince(account.openedDate))} old` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton label={`Edit ${account.name}`} size="sm" onClick={() => setEditing({ kind: 'account', entry: account })}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label={`Remove ${account.name}`}
                        size="sm"
                        onClick={() => setRemoving({ kind: 'account', id: account.id, label: account.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="text-muted">Utilization</span>
                    <span className="tabular font-medium text-ink">
                      {formatCurrency(account.balance)} / {formatCurrency(account.limit)}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    value={util.percent}
                    tone={util.tone}
                    markers={[UTILISATION_IDEAL, UTILISATION_HEALTHY]}
                    label={`${account.name} utilization`}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cnTone(util.tone)}
                    >
                      {formatPercent(util.percent, 0)} used
                    </span>
                    {util.toHealthy > 0 ? (
                      <span className="text-[12px] text-muted">
                        {formatCurrency(util.toHealthy)} before {formatDate(util.statementDate)} reports under 30%
                      </span>
                    ) : (
                      <StatusBadge status="good">Healthy</StatusBadge>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Instalment -------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Loans"
          subtitle="Car, student, mortgage — three fields each, because that is all scoring cares about"
          icon={<Landmark className="h-4 w-4" />}
          action={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ kind: 'debt' })}>
              Add
            </Button>
          }
        />

        {state.debts.length === 0 ? (
          <EmptyState
            className="mt-4"
            compact
            icon={<Landmark className="h-5 w-5" />}
            title="No loans"
            message="Add one if you have a car loan, student loan or mortgage — it completes your credit mix and explains a recent score drop."
          />
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-hairline">
            {state.debts.map((debt) => {
              const months = monthsSince(debt.startDate)
              return (
                <li key={debt.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-secondary">
                    <Landmark className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{debt.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {debt.kind} · {formatCurrency(debt.monthlyPayment)}/month · started {formatDate(debt.startDate)}
                    </p>
                  </div>
                  {months < 12 ? <Badge tone="neutral">{formatTenure(months)} old</Badge> : null}
                  <IconButton label={`Edit ${debt.name}`} size="sm" onClick={() => setEditing({ kind: 'debt', entry: debt })}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={`Remove ${debt.name}`}
                    size="sm"
                    onClick={() => setRemoving({ kind: 'debt', id: debt.id, label: debt.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Inquiries --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Hard inquiries"
          subtitle={
            inquiries.weighing.length
              ? `${inquiries.weighing.length} still counting against your score`
              : 'Credit applications — each counts for about a year'
          }
          icon={<Search className="h-4 w-4" />}
          action={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ kind: 'inquiry' })}>
              Add
            </Button>
          }
        />

        {inquiries.all.length === 0 ? (
          <EmptyState
            className="mt-4"
            compact
            icon={<Search className="h-5 w-5" />}
            title="None recorded"
            message="Add one whenever a lender pulls your file — a card, a loan, a mortgage pre-approval."
          />
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-hairline">
            {inquiries.all.map((status) => (
              <li key={status.inquiry.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-secondary">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{status.inquiry.lender}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    {status.inquiry.purpose ? `${status.inquiry.purpose} · ` : ''}
                    {formatDate(status.inquiry.date)}
                  </p>
                </div>
                {status.weighing ? (
                  <StatusBadge status="warning">Until {formatDate(status.impactEnds)}</StatusBadge>
                ) : (
                  <Badge tone="neutral">No longer counting</Badge>
                )}
                <IconButton
                  label={`Remove ${status.inquiry.lender} inquiry`}
                  size="sm"
                  onClick={() => setRemoving({ kind: 'inquiry', id: status.inquiry.id, label: `${status.inquiry.lender} inquiry` })}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing?.kind === 'account' ? (
        <AccountModal entry={editing.entry} onClose={() => setEditing(null)} />
      ) : null}
      {editing?.kind === 'debt' ? <DebtModal entry={editing.entry} onClose={() => setEditing(null)} /> : null}
      {editing?.kind === 'inquiry' ? <InquiryModal onClose={() => setEditing(null)} /> : null}

      <ConfirmDialog
        open={removing != null}
        title={`Remove ${removing?.label ?? 'this'}?`}
        message={
          removing?.kind === 'inquiry'
            ? 'Only remove an inquiry recorded by mistake — a real one stays on your bureau file whether it is listed here or not.'
            : 'It disappears from the app. Your actual account is untouched.'
        }
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function cnTone(tone: string): string {
  return tone === 'good'
    ? 'text-[12px] font-medium text-ink-secondary'
    : 'text-[12px] font-medium text-negative'
}

/* -------------------------------------------------------------------------- */
/* Account modal                                                              */
/* -------------------------------------------------------------------------- */

const num = (value: string): number => {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : NaN
}

function AccountModal({ entry, onClose }: { entry?: CreditAccount; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()

  const [name, setName] = useState(entry?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(entry?.kind ?? 'Credit Card')
  const [limit, setLimit] = useState(entry ? String(entry.limit) : '')
  const [balance, setBalance] = useState(entry ? String(entry.balance) : '')
  const [statementDay, setStatementDay] = useState(entry ? String(entry.statementDay) : '')
  const [openedDate, setOpenedDate] = useState(entry?.openedDate ?? '')
  const [apr, setApr] = useState(entry?.apr != null ? String(entry.apr) : '')
  const [submitted, setSubmitted] = useState(false)

  const nameError = name.trim() ? undefined : 'Give it a name you will recognise.'
  const limitError = num(limit) > 0 ? undefined : 'Enter the approved limit.'
  const balanceError = balance.trim() === '' || !(num(balance) >= 0) ? 'Enter 0 if nothing is on it.' : undefined
  const day = Math.round(num(statementDay))
  const dayError = day >= 1 && day <= 28 ? undefined : 'Pick a day from 1 to 28.'
  const aprError = apr.trim() && !(num(apr) >= 0 && num(apr) <= 100) ? 'Enter a rate from 0 to 100.' : undefined
  const openedError = openedDate && openedDate > todayISO() ? 'That is in the future.' : undefined
  const invalid = Boolean(nameError || limitError || balanceError || dayError || aprError || openedError)

  function submit() {
    setSubmitted(true)
    if (invalid) return
    const payload = {
      name: name.trim(),
      kind,
      limit: num(limit),
      balance: num(balance),
      statementDay: day,
      openedDate: openedDate || undefined,
      apr: apr.trim() ? num(apr) : undefined,
    }
    if (entry) {
      actions.updateAccount(entry.id, payload)
      toast.success(`${payload.name} updated.`)
    } else {
      actions.addAccount(payload)
      toast.success(`${payload.name} added.`)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? `Edit ${entry.name}` : 'Add a card'}
      description="Four fields do the work. The last two are optional and each unlocks one extra piece of advice."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {entry ? 'Save' : 'Add card'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={submitted ? nameError : undefined} className="sm:col-span-2">
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={name}
              placeholder="CIBC Visa"
              autoComplete="off"
              invalid={submitted && nameError != null}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label="Credit limit" required error={submitted ? limitError : undefined}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={limit}
              placeholder="8000"
              invalid={submitted && limitError != null}
              onChange={(event) => setLimit(event.target.value)}
            />
          )}
        </Field>

        <Field label="Balance now" required error={submitted ? balanceError : undefined}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={balance}
              placeholder="0"
              invalid={submitted && balanceError != null}
              onChange={(event) => setBalance(event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Statement closes on the"
          required
          error={submitted ? dayError : undefined}
          hint="1–28. It is printed on your statement."
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              className="tabular"
              value={statementDay}
              placeholder="25"
              invalid={submitted && dayError != null}
              onChange={(event) => setStatementDay(event.target.value)}
            />
          )}
        </Field>

        <Field label="Type">
          {(id) => (
            <SelectInput id={id} value={kind} onChange={(event) => setKind(event.target.value as AccountKind)}>
              {ACCOUNT_KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>

        <Field label="Opened" error={submitted ? openedError : undefined} hint="Optional — feeds length of history.">
          {(id) => (
            <TextInput
              id={id}
              type="date"
              max={todayISO()}
              value={openedDate}
              invalid={submitted && openedError != null}
              onChange={(event) => setOpenedDate(event.target.value)}
            />
          )}
        </Field>

        <Field label="Interest rate (APR)" error={submitted ? aprError : undefined} hint="Optional — shows what carrying a balance costs.">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              className="tabular"
              value={apr}
              placeholder="20.99"
              invalid={submitted && aprError != null}
              onChange={(event) => setApr(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Debt modal                                                                 */
/* -------------------------------------------------------------------------- */

function DebtModal({ entry, onClose }: { entry?: Debt; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()

  const [name, setName] = useState(entry?.name ?? '')
  const [kind, setKind] = useState<DebtKind>(entry?.kind ?? 'Auto Loan')
  const [monthlyPayment, setMonthlyPayment] = useState(entry ? String(entry.monthlyPayment) : '')
  const [startDate, setStartDate] = useState(entry?.startDate ?? '')
  const [submitted, setSubmitted] = useState(false)

  const nameError = name.trim() ? undefined : 'Give it a name.'
  const dateError = !startDate ? 'When did it start?' : startDate > todayISO() ? 'That is in the future.' : undefined
  const paymentError = monthlyPayment.trim() && !(num(monthlyPayment) >= 0) ? 'Enter a positive amount.' : undefined
  const invalid = Boolean(nameError || dateError || paymentError)

  function submit() {
    setSubmitted(true)
    if (invalid) return
    const payload = {
      name: name.trim(),
      kind,
      monthlyPayment: monthlyPayment.trim() ? num(monthlyPayment) : 0,
      startDate,
    }
    if (entry) {
      actions.updateDebt(entry.id, payload)
      toast.success(`${payload.name} updated.`)
    } else {
      actions.addDebt(payload)
      toast.success(`${payload.name} added.`)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={entry ? `Edit ${entry.name}` : 'Add a loan'}
      description="Scoring only cares that it exists, when it started, and roughly what it costs you."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {entry ? 'Save' : 'Add loan'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={submitted ? nameError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={name}
              placeholder="Car loan"
              autoComplete="off"
              invalid={submitted && nameError != null}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type">
            {(id) => (
              <SelectInput id={id} value={kind} onChange={(event) => setKind(event.target.value as DebtKind)}>
                {DEBT_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Monthly payment" error={submitted ? paymentError : undefined}>
            {(id) => (
              <CurrencyInput
                id={id}
                value={monthlyPayment}
                placeholder="484"
                invalid={submitted && paymentError != null}
                onChange={(event) => setMonthlyPayment(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="When did it start?"
          required
          error={submitted ? dateError : undefined}
          hint="Roughly is fine — it drives the recovery timeline on the credit page."
        >
          {(id) => (
            <TextInput
              id={id}
              type="date"
              max={todayISO()}
              value={startDate}
              invalid={submitted && dateError != null}
              onChange={(event) => setStartDate(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Inquiry modal                                                              */
/* -------------------------------------------------------------------------- */

function InquiryModal({ onClose }: { onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()

  const [lender, setLender] = useState('')
  const [purpose, setPurpose] = useState('')
  const [date, setDate] = useState(todayISO())
  const [submitted, setSubmitted] = useState(false)

  const lenderError = lender.trim() ? undefined : 'Who pulled your file?'
  const dateError = !date ? 'Pick a date.' : date > todayISO() ? 'That is in the future.' : undefined

  function submit() {
    setSubmitted(true)
    if (lenderError || dateError) return
    actions.addInquiry({ date, lender: lender.trim(), purpose: purpose.trim() || undefined })
    toast.success(`${lender.trim()} inquiry added.`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add a hard inquiry"
      description="Any credit application — card, loan, mortgage pre-approval, some phone and utility accounts."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Lender" required error={submitted ? lenderError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={lender}
              placeholder="CIBC"
              autoComplete="off"
              invalid={submitted && lenderError != null}
              onChange={(event) => setLender(event.target.value)}
            />
          )}
        </Field>
        <Field label="What for" hint="Optional.">
          {(id) => (
            <TextInput
              id={id}
              value={purpose}
              placeholder="Auto loan"
              onChange={(event) => setPurpose(event.target.value)}
            />
          )}
        </Field>
        <Field label="When" required error={submitted ? dateError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              max={todayISO()}
              value={date}
              invalid={submitted && dateError != null}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
