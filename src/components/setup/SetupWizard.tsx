/**
 * First-run setup.
 *
 * Three short steps, every one skippable. The whole thing is about a dozen
 * fields because that is genuinely all the engine needs — anything that would
 * not change a recommendation is not asked for. A card is four fields; a loan
 * is three; your score is one.
 *
 * Nothing is written to the store until the last step, so backing out or
 * closing leaves the workspace untouched.
 */

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CreditCard, Gauge, Landmark, Plus, Trash2 } from 'lucide-react'
import type { AccountKind, CreditAccount, CreditBureau, DebtKind } from '../../types'
import { ACCOUNT_KINDS, CREDIT_BUREAUS, DEBT_KINDS, SCORE_SOURCES } from '../../types'
import { useActions } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Button, IconButton } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { CurrencyInput, Field, SelectInput, Switch, TextInput } from '../ui/Field'
import { Segmented } from '../ui/Tabs'
import { Badge } from '../ui/Badge'
import { monthStartISO, todayISO } from '../../lib/date'
import { cn } from '../../lib/cn'

/* -------------------------------------------------------------------------- */
/* Drafts — strings, so a field can be genuinely empty while being typed       */
/* -------------------------------------------------------------------------- */

interface AccountDraft {
  key: string
  name: string
  kind: AccountKind
  limit: string
  balance: string
  statementDay: string
  openedDate: string
  apr: string
}

interface DebtDraft {
  key: string
  name: string
  kind: DebtKind
  monthlyPayment: string
  startDate: string
}

let sequence = 0
const nextKey = () => `draft-${(sequence += 1)}`

const emptyAccount = (): AccountDraft => ({
  key: nextKey(),
  name: '',
  kind: 'Credit Card',
  limit: '',
  balance: '',
  statementDay: '',
  openedDate: '',
  apr: '',
})

const emptyDebt = (): DebtDraft => ({
  key: nextKey(),
  name: '',
  kind: 'Auto Loan',
  monthlyPayment: '',
  startDate: '',
})

const num = (value: string): number => {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : NaN
}

/** A row counts as filled in once it has a name and a limit — the rest can wait. */
const accountUsable = (draft: AccountDraft) => draft.name.trim() !== '' && num(draft.limit) > 0
const debtUsable = (draft: DebtDraft) => draft.name.trim() !== '' && Boolean(draft.startDate)

const STEPS = ['Cards', 'Loans', 'Score'] as const

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState<AccountDraft[]>([emptyAccount()])
  const [debts, setDebts] = useState<DebtDraft[]>([])

  const [score, setScore] = useState('')
  const [bureau, setBureau] = useState<CreditBureau>('Equifax')
  const [source, setSource] = useState<string>('Borrowell')
  const [historyStart, setHistoryStart] = useState('')
  const [missedPayment, setMissedPayment] = useState(false)
  const [inquiryLender, setInquiryLender] = useState('')
  const [inquiryDate, setInquiryDate] = useState('')

  const patchAccount = (key: string, patch: Partial<AccountDraft>) =>
    setAccounts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const patchDebt = (key: string, patch: Partial<DebtDraft>) =>
    setDebts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const scoreValue = num(score)
  const scoreInvalid = score.trim() !== '' && (!Number.isFinite(scoreValue) || scoreValue < 300 || scoreValue > 900)

  function finish() {
    if (scoreInvalid) {
      setStep(2)
      return
    }

    for (const draft of accounts) {
      if (!accountUsable(draft)) continue
      const limit = num(draft.limit)
      const balance = Number.isFinite(num(draft.balance)) ? Math.max(0, num(draft.balance)) : 0
      const day = Math.round(num(draft.statementDay))
      const account: Omit<CreditAccount, 'id'> = {
        name: draft.name.trim(),
        kind: draft.kind,
        limit,
        balance,
        // A missing statement day still has to land somewhere sane; the 1st is
        // the least surprising default and the Accounts page flags it.
        statementDay: day >= 1 && day <= 28 ? day : 1,
        openedDate: draft.openedDate || undefined,
        apr: draft.apr.trim() && Number.isFinite(num(draft.apr)) ? num(draft.apr) : undefined,
      }
      actions.addAccount(account)
    }

    for (const draft of debts) {
      if (!debtUsable(draft)) continue
      actions.addDebt({
        name: draft.name.trim(),
        kind: draft.kind,
        monthlyPayment: Number.isFinite(num(draft.monthlyPayment)) ? Math.max(0, num(draft.monthlyPayment)) : 0,
        startDate: draft.startDate,
      })
    }

    if (score.trim() && !scoreInvalid) {
      actions.addScore({
        date: todayISO(),
        score: Math.round(scoreValue),
        bureau,
        source: source || undefined,
      })
    }

    if (inquiryLender.trim() && inquiryDate) {
      actions.addInquiry({ date: inquiryDate, lender: inquiryLender.trim() })
    }

    actions.updateSettings({
      missedPaymentLast2Years: missedPayment,
      creditHistoryStart: historyStart || undefined,
    })

    const added = accounts.filter(accountUsable).length + debts.filter(debtUsable).length
    toast.success(added ? 'Set up — everything on the credit page is live now.' : 'Ready when you are.')
    onClose()
  }

  const last = step === STEPS.length - 1

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Set up CreditCompass"
      description="About a minute. Everything here is optional — you can fill in the rest later."
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((label, index) => (
              <span
                key={label}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === step ? 'w-5 bg-brand' : index < step ? 'w-1.5 bg-brand/50' : 'w-1.5 bg-surface-3',
                )}
              />
            ))}
          </span>
          {step > 0 ? (
            <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : (
            <Button onClick={onClose}>Skip setup</Button>
          )}
          {last ? (
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={finish}>
              Finish
            </Button>
          ) : (
            <Button variant="primary" iconEnd={<ArrowRight className="h-4 w-4" />} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </>
      }
    >
      {/* Step 1 · Cards ---------------------------------------------------- */}
      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <StepHeading
            icon={<CreditCard className="h-4 w-4" />}
            title="Your credit cards"
            detail="Four fields each. The balance is the one worth keeping current later — it drives utilization, which is the fastest lever on your score."
          />

          {accounts.map((draft, index) => (
            <div key={draft.key} className="rounded-xl border border-hairline bg-surface-2 p-3.5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-muted">Card {index + 1}</span>
                {accounts.length > 1 ? (
                  <IconButton
                    label={`Remove card ${index + 1}`}
                    size="sm"
                    onClick={() => setAccounts((rows) => rows.filter((row) => row.key !== draft.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Name" className="sm:col-span-2">
                  {(id) => (
                    <TextInput
                      id={id}
                      autoFocus={index === 0}
                      value={draft.name}
                      placeholder="CIBC Visa"
                      autoComplete="off"
                      onChange={(event) => patchAccount(draft.key, { name: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Credit limit">
                  {(id) => (
                    <CurrencyInput
                      id={id}
                      value={draft.limit}
                      placeholder="8000"
                      onChange={(event) => patchAccount(draft.key, { limit: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Balance right now">
                  {(id) => (
                    <CurrencyInput
                      id={id}
                      value={draft.balance}
                      placeholder="0"
                      onChange={(event) => patchAccount(draft.key, { balance: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Statement closes on the" hint="Day 1–28. It is on your statement.">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={28}
                      className="tabular"
                      value={draft.statementDay}
                      placeholder="25"
                      onChange={(event) => patchAccount(draft.key, { statementDay: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Type">
                  {(id) => (
                    <SelectInput
                      id={id}
                      value={draft.kind}
                      onChange={(event) => patchAccount(draft.key, { kind: event.target.value as AccountKind })}
                    >
                      {ACCOUNT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
              </div>
            </div>
          ))}

          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setAccounts((rows) => [...rows, emptyAccount()])}
          >
            Add another card
          </Button>
        </div>
      ) : null}

      {/* Step 2 · Loans ---------------------------------------------------- */}
      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <StepHeading
            icon={<Landmark className="h-4 w-4" />}
            title="Anything you are paying off?"
            detail="A car loan, student loan, mortgage. Three fields — scoring only cares that it exists, when it started, and roughly what it costs you. Skip this if you have none."
          />

          {debts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline-strong px-4 py-8 text-center">
              <p className="text-[13px] text-muted">Nothing added yet.</p>
              <Button
                className="mt-3"
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setDebts([emptyDebt()])}
              >
                Add a loan
              </Button>
            </div>
          ) : (
            <>
              {debts.map((draft, index) => (
                <div key={draft.key} className="rounded-xl border border-hairline bg-surface-2 p-3.5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-muted">Loan {index + 1}</span>
                    <IconButton
                      label={`Remove loan ${index + 1}`}
                      size="sm"
                      onClick={() => setDebts((rows) => rows.filter((row) => row.key !== draft.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Name">
                      {(id) => (
                        <TextInput
                          id={id}
                          autoFocus
                          value={draft.name}
                          placeholder="Car loan"
                          autoComplete="off"
                          onChange={(event) => patchDebt(draft.key, { name: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Type">
                      {(id) => (
                        <SelectInput
                          id={id}
                          value={draft.kind}
                          onChange={(event) => patchDebt(draft.key, { kind: event.target.value as DebtKind })}
                        >
                          {DEBT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {kind}
                            </option>
                          ))}
                        </SelectInput>
                      )}
                    </Field>
                    <Field label="Monthly payment">
                      {(id) => (
                        <CurrencyInput
                          id={id}
                          value={draft.monthlyPayment}
                          placeholder="484"
                          onChange={(event) => patchDebt(draft.key, { monthlyPayment: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="When did it start?" hint="Roughly is fine — it drives the recovery timeline.">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="date"
                          max={todayISO()}
                          value={draft.startDate}
                          onChange={(event) => patchDebt(draft.key, { startDate: event.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              ))}
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDebts((rows) => [...rows, emptyDebt()])}>
                Add another loan
              </Button>
            </>
          )}
        </div>
      ) : null}

      {/* Step 3 · Score ---------------------------------------------------- */}
      {step === 2 ? (
        <div className="flex flex-col gap-5">
          <StepHeading
            icon={<Gauge className="h-4 w-4" />}
            title="Your score today"
            detail="One number, from Borrowell, Credit Karma or your bank app — all free. The advice works without it; this is what draws the trend line."
          />

          <div className="flex flex-col gap-3">
            <Segmented
              ariaLabel="Credit bureau"
              value={bureau}
              onChange={(next) => {
                setBureau(next)
                if (next === 'TransUnion' && source === 'Borrowell') setSource('Credit Karma')
                if (next === 'Equifax' && source === 'Credit Karma') setSource('Borrowell')
              }}
              options={CREDIT_BUREAUS.map((option) => ({ value: option, label: option }))}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label={`${bureau} score`}
                error={scoreInvalid ? 'Canadian scores run from 300 to 900.' : undefined}
              >
                {(id) => (
                  <TextInput
                    id={id}
                    autoFocus
                    type="number"
                    inputMode="numeric"
                    min={300}
                    max={900}
                    className="tabular"
                    value={score}
                    placeholder="676"
                    invalid={scoreInvalid}
                    onChange={(event) => setScore(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Where from">
                {(id) => (
                  <SelectInput id={id} value={source} onChange={(event) => setSource(event.target.value)}>
                    {SCORE_SOURCES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
            </div>
          </div>

          <div className="border-t border-hairline pt-4">
            <Field
              label="When did you start building credit in Canada?"
              hint="Your first card or loan here. Length of history is about 15% of the score, and this is how the app knows whether that is holding you back."
            >
              {(id) => (
                <TextInput
                  id={id}
                  type="month"
                  max={todayISO().slice(0, 7)}
                  value={historyStart ? historyStart.slice(0, 7) : ''}
                  onChange={(event) => setHistoryStart(event.target.value ? monthStartISO(event.target.value) : '')}
                />
              )}
            </Field>
          </div>

          <div className="rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
            <Switch
              checked={missedPayment}
              onChange={setMissedPayment}
              label="I have missed a payment in the last 2 years"
              description="Asked once instead of tracking every bill. A payment reported 30+ days late is the most damaging thing on a file, so the advice changes if there is one."
            />
          </div>

          <div className="border-t border-hairline pt-4">
            <p className="text-[13px] font-medium text-ink">Applied for credit in the last year?</p>
            <p className="mt-0.5 mb-3 text-[12px] leading-relaxed text-muted">
              A car loan, card, mortgage pre-approval. Each hard check weighs on the score for about a year — the
              app counts down to when yours stops counting. <Badge tone="neutral">Optional</Badge>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Lender">
                {(id) => (
                  <TextInput
                    id={id}
                    value={inquiryLender}
                    placeholder="CIBC"
                    autoComplete="off"
                    onChange={(event) => setInquiryLender(event.target.value)}
                  />
                )}
              </Field>
              <Field label="When">
                {(id) => (
                  <TextInput
                    id={id}
                    type="date"
                    max={todayISO()}
                    value={inquiryDate}
                    onChange={(event) => setInquiryDate(event.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

function StepHeading({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">{detail}</p>
      </div>
    </div>
  )
}
