/**
 * Settings.
 *
 * There is deliberately no "Save" button. A settings screen with one invites
 * people to change something, walk away, and assume it stuck. Instead every
 * control writes straight through to the store: text and number fields commit
 * on blur (so a half-typed figure never lands in state), selects, sliders and
 * segmented controls commit on release, and each write confirms with a toast so
 * the missing save button never reads as "nothing happened".
 *
 * Drafts are held locally per field and re-seeded from settings whenever the
 * underlying value changes — that keeps the inputs correct after an import or a
 * reset, which are the only ways these numbers move without this form.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeftRight,
  BellRing,
  BookOpen,
  Calculator,
  CreditCard,
  Database,
  Download,
  FileJson,
  Landmark,
  Lock,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useTheme } from '../store/ThemeProvider'
import type { AppState, ThemePreference } from '../types'
import { averageMonthlyExpense, defaultSettings, fiStatus } from '../lib/finance'
import { buildAllNotifications } from '../lib/credit'
import { monthRange, todayISO } from '../lib/date'
import { formatCurrency, formatNumber, formatPercent } from '../lib/format'
import { series } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { CurrencyInput, Field, SelectInput, TextInput } from '../components/ui/Field'
import { Segmented } from '../components/ui/Tabs'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { hrefFor } from '../hooks/useRouter'

/** Only one of these can be open at a time, so one slot covers all four flows. */
type DataDialog = 'export' | 'import' | 'demo' | 'empty'

interface PendingImport {
  state: AppState
  fileName: string
}

/* -------------------------------------------------------------------------- */

export default function Settings() {
  const state = useAppState()
  const { replaceState, resetToDemo, resetToEmpty } = useActions()
  const toast = useToast()

  const [dialog, setDialog] = useState<DataDialog | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const closeDialog = () => setDialog(null)

  function handleExport() {
    closeDialog()
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `creditcompass-backup-${todayISO()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Revoked on the next tick, not synchronously: Safari cancels an in-flight
    // download the moment its object URL disappears.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    toast.success('Backup downloaded to your device.')
  }

  async function handleFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing the value lets the same file be picked twice; otherwise the
    // input keeps its value and `change` never fires again.
    event.target.value = ''
    if (!file) return

    try {
      const parsed: unknown = JSON.parse(await file.text())
      const candidate = toAppState(parsed)
      if (!candidate) {
        toast.warn(
          `“${file.name}” is not a CreditCompass backup — it needs a “settings” object and a “transactions” list.`,
        )
        return
      }
      setPendingImport({ state: candidate, fileName: file.name })
      setDialog('import')
    } catch {
      toast.warn(`Could not read “${file.name}”. Pick the JSON file CreditCompass exported.`)
    }
  }

  function handleImport() {
    if (!pendingImport) return
    replaceState(pendingImport.state)
    closeDialog()
    toast.success(`Restored ${formatNumber(pendingImport.state.transactions.length)} transactions from the backup.`)
    setPendingImport(null)
  }

  function handleResetDemo() {
    resetToDemo()
    closeDialog()
    toast.success('Demo data loaded — a full year of sample activity.')
  }

  function handleResetEmpty() {
    resetToEmpty()
    closeDialog()
    toast.success('Workspace cleared. Add your first transaction to begin.')
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        subtitle="Your profile, the assumptions behind every projection, and what happens to your data."
        action={
          <Button icon={<Download className="h-4 w-4" />} onClick={() => setDialog('export')}>
            Export backup
          </Button>
        }
      />

      <StoredDataStrip onLoadDemo={() => setDialog('demo')} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ProfileCard />
        <AppearanceCard />
        <AlertsCard />
        <PlanningCard />

        <Card className="lg:col-span-7">
          <CardHeader
            title="Your data"
            subtitle="Back it up, bring it back, or start over"
            icon={<Database className="h-4 w-4" />}
          />

          <div className="mt-4 flex flex-col gap-2.5">
            <DataAction
              icon={<Download className="h-4 w-4" />}
              title="Export my data"
              description="One JSON file with every transaction, budget, goal, holding, loan, card and setting."
            >
              <Button size="sm" variant="primary" onClick={() => setDialog('export')}>
                Download JSON
              </Button>
            </DataAction>

            <DataAction
              icon={<Upload className="h-4 w-4" />}
              title="Import a backup"
              description="Replaces everything currently stored with the contents of the file you pick."
            >
              <Button size="sm" onClick={() => fileInput.current?.click()}>
                Choose file
              </Button>
              {/* Hidden on purpose — the native file button can't be styled to
                  match, so a real Button proxies the click to it. */}
              <input
                ref={fileInput}
                type="file"
                // `.json` is listed alongside the MIME type because some systems
                // report exported files as text/plain and would hide them.
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleFilePicked(event)}
              />
            </DataAction>

            <DataAction
              icon={<RotateCcw className="h-4 w-4" />}
              title="Start over"
              description="Load the demo workspace to explore the app, or wipe everything and enter your own figures."
            >
              <Button size="sm" onClick={() => setDialog('demo')}>
                Reset to demo data
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDialog('empty')}
              >
                Start empty
              </Button>
            </DataAction>
          </div>

          <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Everything you type stays in this browser&rsquo;s local storage. There is no account, no sync and no
              server — nothing is sent anywhere. The flip side: clearing site data, using private browsing, or
              opening CreditCompass on another browser or device gives you an empty workspace. Export a backup before
              you clear anything.
            </span>
          </p>
        </Card>

        <AboutCard />
      </div>

      <ConfirmDialog
        open={dialog === 'export'}
        title="Download a backup?"
        destructive={false}
        confirmLabel="Download JSON"
        message={
          <>
            This saves <strong className="font-medium text-ink">creditcompass-backup-{todayISO()}.json</strong> to your
            downloads folder. It contains every figure in this workspace in plain text, so keep it somewhere you
            would keep a bank statement.
          </>
        }
        onConfirm={handleExport}
        onCancel={closeDialog}
      />

      <ConfirmDialog
        open={dialog === 'import' && pendingImport != null}
        title="Replace everything with this backup?"
        confirmLabel="Restore backup"
        message={
          pendingImport ? (
            <>
              <strong className="font-medium text-ink">{pendingImport.fileName}</strong> holds{' '}
              {describeState(pendingImport.state)}. Restoring it discards what is stored right now —{' '}
              {describeState(state)} — and that cannot be undone.
            </>
          ) : (
            ''
          )
        }
        onConfirm={handleImport}
        onCancel={() => {
          closeDialog()
          setPendingImport(null)
        }}
      />

      <ConfirmDialog
        open={dialog === 'demo'}
        title="Reset to demo data?"
        confirmLabel="Load demo data"
        message="Your current workspace is discarded and replaced with a year of realistic sample activity — useful for exploring the app, but it will overwrite anything you have entered."
        onConfirm={handleResetDemo}
        onCancel={closeDialog}
      />

      <ConfirmDialog
        open={dialog === 'empty'}
        title="Delete everything and start empty?"
        confirmLabel="Delete everything"
        message="Every transaction, budget, goal, investment, loan, card, asset and liability is erased. Your name and planning assumptions are kept. This cannot be undone — export a backup first if you might want it back."
        onConfirm={handleResetEmpty}
        onCancel={closeDialog}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Live summary strip                                                         */
/* -------------------------------------------------------------------------- */

function StoredDataStrip({ onLoadDemo }: { onLoadDemo: () => void }) {
  const state = useAppState()

  const rows = [
    { label: 'Transactions', value: state.transactions.length, icon: <ArrowLeftRight className="h-3.5 w-3.5" />, href: '/transactions' },
    { label: 'Savings goals', value: state.goals.length, icon: <Target className="h-3.5 w-3.5" />, href: '/savings' },
    { label: 'Investments', value: state.investments.length, icon: <TrendingUp className="h-3.5 w-3.5" />, href: '/investments' },
    { label: 'Loans', value: state.loans.length, icon: <Landmark className="h-3.5 w-3.5" />, href: '/loans' },
    { label: 'Credit cards', value: state.cards.length, icon: <CreditCard className="h-3.5 w-3.5" />, href: '/cards' },
  ]

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  // Measuring the serialised payload is the only honest read on how much room
  // this workspace takes in the ~5 MB local-storage budget.
  const bytes = useMemo(() => new Blob([JSON.stringify(state)]).size, [state])

  return (
    <Card>
      <CardHeader
        title="Stored on this device"
        subtitle="Everything CreditCompass is keeping for you right now"
        icon={<ShieldCheck className="h-4 w-4" />}
        action={<Badge tone="neutral">{formatBytes(bytes)}</Badge>}
      />

      {total === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          icon={<Database className="h-5 w-5" />}
          title="Nothing stored yet"
          message="Add your first transaction, or load the demo workspace to see how a full year looks."
          action={
            <Button size="sm" variant="primary" onClick={onLoadDemo}>
              Load demo data
            </Button>
          }
        />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((row) => (
            <a
              key={row.label}
              href={hrefFor(row.href)}
              className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 transition-colors hover:bg-surface-3"
            >
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
                {row.icon}
                <span className="truncate">{row.label}</span>
              </span>
              <span className="tabular text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
                {formatNumber(row.value)}
              </span>
            </a>
          ))}
        </div>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* 1 · Profile                                                                */
/* -------------------------------------------------------------------------- */

function ProfileCard() {
  const { settings } = useAppState()
  const { updateSettings } = useActions()
  const toast = useToast()

  const [name, setName] = useState(settings.name)
  const [salary, setSalary] = useState(String(settings.monthlySalary))

  useEffect(() => {
    setName(settings.name)
  }, [settings.name])
  useEffect(() => {
    setSalary(String(settings.monthlySalary))
  }, [settings.monthlySalary])

  const nameError = name.trim() === '' ? 'Your name cannot be blank.' : undefined
  const salaryValue = Number(salary)
  const salaryError =
    salary.trim() === '' || !Number.isFinite(salaryValue) || salaryValue < 0
      ? 'Enter your take-home pay as a positive number.'
      : undefined

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === settings.name) return
    updateSettings({ name: trimmed })
    toast.success(`Saved — CreditCompass will greet you as ${trimmed.split(' ')[0]}.`)
  }

  function commitSalary() {
    if (salaryError || salaryValue === settings.monthlySalary) return
    updateSettings({ monthlySalary: salaryValue })
    toast.success(`Monthly salary set to ${formatCurrency(salaryValue)}.`)
  }

  return (
    <Card className="lg:col-span-6">
      <CardHeader
        title="Profile"
        subtitle="Who you are and what lands in your account each month"
        icon={<UserRound className="h-4 w-4" />}
      />

      <div className="mt-4 flex flex-col gap-4">
        <Field label="Name" hint="Used for the dashboard greeting and on exported reports." error={nameError}>
          {(id) => (
            <TextInput
              id={id}
              value={name}
              invalid={Boolean(nameError)}
              autoComplete="name"
              placeholder="Your name"
              onChange={(event) => setName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Monthly salary"
            hint="Take-home, after tax. Drives the cash-flow forecast and salary-day plan."
            error={salaryError}
          >
            {(id) => (
              <CurrencyInput
                id={id}
                value={salary}
                invalid={Boolean(salaryError)}
                onChange={(event) => setSalary(event.target.value)}
                onBlur={commitSalary}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
            )}
          </Field>

          <Field label="Salary day" hint="Capped at 28 so the date exists in every month, February included.">
            {(id) => (
              <SelectInput
                id={id}
                value={settings.salaryDay}
                onChange={(event) => {
                  const day = Number(event.target.value)
                  updateSettings({ salaryDay: day })
                  toast.success(`Salary day set to the ${ordinal(day)}.`)
                }}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {ordinal(day)} of the month
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* 2 · Appearance                                                             */
/* -------------------------------------------------------------------------- */

function AppearanceCard() {
  const { preference, mode, setPreference } = useTheme()
  const toast = useToast()

  const options: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
  ]

  return (
    <Card className="lg:col-span-6">
      <CardHeader
        title="Appearance"
        subtitle="Light, dark, or whatever your device is doing"
        icon={<Palette className="h-4 w-4" />}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Theme"
          options={options}
          value={preference}
          onChange={(next) => {
            if (next === preference) return
            setPreference(next)
            toast.success(
              next === 'system' ? 'Theme now follows your device.' : `Switched to the ${next} theme.`,
            )
          }}
        />
        <Badge tone="neutral" icon={mode === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}>
          Showing {mode}
        </Badge>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
        {preference === 'system'
          ? `Following your device, which is currently set to ${mode}. Change it in your OS and CreditCompass follows immediately — no reload.`
          : `Pinned to ${preference}, so it stays put even if your device switches at sunset.`}
      </p>

      <div className="mt-4 rounded-xl border border-hairline bg-surface-2 p-3.5">
        <p className="text-[12px] font-medium text-muted">Chart palette · {mode} theme</p>
        <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
          {series(mode).map((color, index) => (
            <span key={index} className="h-6 flex-1 rounded-md" style={{ backgroundColor: color }} />
          ))}
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
          These eight colours are stepped separately for the light and dark surfaces and checked for deuteranopia,
          protanopia and tritanopia separation in both. Colour is never the only cue either — every chart also
          carries a legend and a table view, and status is always paired with an icon and a word.
        </p>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* 3 · Alerts                                                                 */
/* -------------------------------------------------------------------------- */

function AlertsCard() {
  const state = useAppState()
  const { updateSettings, restoreAlerts } = useActions()
  const toast = useToast()
  const { settings } = state

  // `buildNotifications` already filters dismissals out, so rebuilding with an
  // empty list is the only way to count the alerts that apply today *and* are
  // being suppressed. Stale ids (a bill since paid) correctly drop out.
  const hiddenNow = useMemo(() => {
    const dismissed = new Set(state.dismissedAlerts)
    return buildAllNotifications({ ...state, dismissedAlerts: [] }).filter((n) => dismissed.has(n.id)).length
  }, [state])

  const remembered = state.dismissedAlerts.length

  return (
    <Card className="lg:col-span-6">
      <CardHeader
        title="Alerts & reminders"
        subtitle="When CreditCompass speaks up, and how early"
        icon={<BellRing className="h-4 w-4" />}
      />

      <div className="mt-4 flex flex-col gap-5">
        <RangeSetting
          label="Budget alert threshold"
          min={50}
          max={100}
          value={settings.budgetAlertThreshold}
          format={(n) => `${n}%`}
          hint="A category warns once it crosses this share of its limit, giving you room to slow down before you actually go over."
          onCommit={(next) => {
            updateSettings({ budgetAlertThreshold: next })
            toast.success(`Budget warnings now fire at ${next}% of the limit.`)
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="warning">At {settings.budgetAlertThreshold}% of the limit</StatusBadge>
            <StatusBadge status="critical">Over 100%</StatusBadge>
          </div>
        </RangeSetting>

        <RangeSetting
          label="Reminder lead time"
          min={1}
          max={15}
          value={settings.reminderLeadDays}
          format={(n) => `${n} ${n === 1 ? 'day' : 'days'}`}
          hint="Loan-payment and credit-card reminders appear this far ahead of the due date, on the dashboard and in the notification tray."
          onCommit={(next) => {
            updateSettings({ reminderLeadDays: next })
            toast.success(`Reminders now start ${next} ${next === 1 ? 'day' : 'days'} before a due date.`)
          }}
        />

        <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-2 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Dismissed notifications</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {remembered === 0
                ? 'Nothing is hidden — every alert that applies is showing.'
                : hiddenNow === 0
                  ? `${formatNumber(remembered)} dismissal${remembered === 1 ? '' : 's'} remembered, none of which apply today.`
                  : `${formatNumber(hiddenNow)} of today's alerts ${hiddenNow === 1 ? 'is' : 'are'} hidden, from ${formatNumber(remembered)} dismissal${remembered === 1 ? '' : 's'} remembered.`}
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={remembered === 0}
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              restoreAlerts()
              toast.success('Dismissed notifications restored.')
            }}
          >
            Restore all
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* 4 · Planning assumptions                                                   */
/* -------------------------------------------------------------------------- */

function PlanningCard() {
  const state = useAppState()
  const { updateSettings } = useActions()
  const toast = useToast()
  const { settings } = state

  const fi = useMemo(() => fiStatus(state), [state])
  const actualAverage = useMemo(
    () => averageMonthlyExpense(state.transactions, monthRange(6)),
    [state.transactions],
  )

  return (
    <Card className="lg:col-span-6">
      <CardHeader
        title="Planning assumptions"
        subtitle="The four numbers every projection is built on"
        icon={<Calculator className="h-4 w-4" />}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberSetting
          label="Expected annual return"
          suffix="% a year"
          min={0}
          max={30}
          step={0.5}
          value={settings.expectedReturnRate}
          hint="The rate your invested money is assumed to compound at. Drives the corpus forecast and the years-to-FI figure."
          onCommit={(next) => {
            updateSettings({ expectedReturnRate: next })
            toast.success(`Expected return set to ${formatPercent(next)} a year.`)
          }}
        />

        <NumberSetting
          label="Inflation"
          suffix="% a year"
          min={0}
          max={20}
          step={0.5}
          value={settings.inflationRate}
          hint="What today's spending is assumed to cost later. Used on the planning page to show goals in future money."
          onCommit={(next) => {
            updateSettings({ inflationRate: next })
            toast.success(`Inflation assumption set to ${formatPercent(next)}.`)
          }}
        />

        <NumberSetting
          label="Safe withdrawal rate"
          suffix="% a year"
          min={1}
          max={10}
          step={0.1}
          value={settings.safeWithdrawalRate}
          hint="The share of your corpus you could draw each year indefinitely. Your FI number is annual expenses divided by this."
          onCommit={(next) => {
            updateSettings({ safeWithdrawalRate: next })
            toast.success(`Safe withdrawal rate set to ${formatPercent(next)}.`)
          }}
        />

        <NumberSetting
          label="FI monthly expenses"
          currency
          min={0}
          max={100_000_000}
          step={1000}
          value={settings.fiMonthlyExpenses}
          hint={
            actualAverage > 0
              ? `The monthly spend your corpus must cover. Leave it at 0 to use your actual average, currently ${formatCurrency(actualAverage)}.`
              : 'The monthly spend your corpus must cover. Leave it at 0 to use your actual average once you have a few months of expenses logged.'
          }
          onCommit={(next) => {
            updateSettings({ fiMonthlyExpenses: next })
            toast.success(
              next === 0
                ? 'FI target will follow your actual average spend.'
                : `FI target now assumes ${formatCurrency(next)} a month.`,
            )
          }}
        />
      </div>

      <div className="mt-4 rounded-xl border border-hairline bg-surface-2 p-3.5">
        <p className="text-[12px] font-medium text-muted">With these assumptions</p>
        {fi.fiNumber > 0 ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
            Your financial-independence number is{' '}
            <span className="tabular font-semibold text-ink">{formatCurrency(fi.fiNumber)}</span> —{' '}
            {formatCurrency(fi.monthlyExpenses)} a month drawn at {formatPercent(settings.safeWithdrawalRate)}. You
            are {formatPercent(fi.percent, 0)} of the way there
            {fi.yearsToFi != null
              ? `, roughly ${formatNumber(fi.yearsToFi, true)} years out at ${formatCurrency(fi.monthlyInvestment)} invested a month.`
              : '. Add a recurring contribution and CreditCompass can estimate how long it takes.'}
          </p>
        ) : (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
            Log a few months of expenses, or set an FI monthly figure above, and CreditCompass will work out the corpus
            you need.
          </p>
        )}
        <a
          href={hrefFor('/planning')}
          className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
        >
          Open planning
        </a>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* 6 · About                                                                  */
/* -------------------------------------------------------------------------- */

function AboutCard() {
  const state = useAppState()

  return (
    <Card className="lg:col-span-5">
      <CardHeader
        title="About CreditCompass"
        subtitle={`Personal finance, version ${state.version}.0`}
        icon={<Sparkles className="h-4 w-4" />}
      />

      <dl className="mt-4 flex flex-col gap-3.5">
        <div>
          <dt className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            What it tracks
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
            Income and expenses, category budgets, savings goals, investments and recurring contributions, loan amortisation, credit
            card cycles, manual assets and liabilities — rolled into net worth, a cash-flow forecast and a
            financial-independence projection.
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Where it lives
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
            In this browser&rsquo;s local storage, on this device, and nowhere else. No account, no analytics, no
            network call carries your figures.
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
            Built to move
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
            Feature code never touches storage directly — it goes through a{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-[12px] text-ink">FinanceRepository</code>{' '}
            interface with async <code className="rounded bg-surface-2 px-1 py-0.5 text-[12px] text-ink">load</code>{' '}
            and <code className="rounded bg-surface-2 px-1 py-0.5 text-[12px] text-ink">save</code> methods. Dropping
            in a REST or IndexedDB backend later is one implementation swap, with no edits anywhere in the pages.
          </dd>
        </div>
      </dl>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared building blocks                                                     */
/* -------------------------------------------------------------------------- */

function DataAction({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-2 p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-secondary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

/**
 * Slider whose value is committed on release rather than on every tick —
 * dragging the thumb would otherwise fire one store write and one toast per
 * pixel. The read-out follows the draft so the drag still feels live.
 */
function RangeSetting({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  format,
  onCommit,
  children,
}: {
  label: string
  hint: string
  min: number
  max: number
  step?: number
  value: number
  format: (n: number) => string
  onCommit: (next: number) => void
  children?: ReactNode
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    if (draft !== value) onCommit(draft)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-secondary">
          {label}
        </label>
        <span className="tabular shrink-0 text-[15px] font-semibold text-ink">{format(draft)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full cursor-pointer accent-brand"
      />
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">{hint}</p>
      {children}
    </div>
  )
}

/**
 * Number field that commits on blur. Out-of-range input is shown as an error and
 * simply never written — clamping silently would hide a typo rather than flag it.
 */
function NumberSetting({
  label,
  hint,
  suffix,
  currency,
  min,
  max,
  step,
  value,
  onCommit,
}: {
  label: string
  hint: ReactNode
  suffix?: string
  currency?: boolean
  min: number
  max: number
  step: number
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => setDraft(String(value)), [value])

  const parsed = Number(draft)
  const invalid = draft.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max
  const error = invalid
    ? currency
      ? `Enter an amount between ${formatCurrency(min)} and ${formatCurrency(max)}.`
      : `Enter a number between ${min} and ${max}.`
    : undefined

  const commit = () => {
    if (invalid || parsed === value) return
    onCommit(parsed)
  }

  const shared = {
    value: draft,
    invalid,
    min,
    max,
    step,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    onBlur: commit,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur()
    },
  }

  return (
    <Field label={suffix ? `${label} (${suffix})` : label} hint={hint} error={error}>
      {(id) =>
        currency ? (
          <CurrencyInput id={id} {...shared} />
        ) : (
          <TextInput id={id} type="number" inputMode="decimal" className="tabular" {...shared} />
        )
      }
    </Field>
  )
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Untrusted JSON claims a type it may not honour, so guard before trusting it. */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/**
 * Validate and normalise an imported payload.
 *
 * `settings` and `transactions` are the two fields that make a file recognisably
 * ours, so their absence rejects it outright. Everything else is filled in from
 * defaults rather than trusted — a backup written by an older build is missing
 * fields the pages now read, and a half-restored state would crash them.
 */
function toAppState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Partial<AppState>

  if (!Array.isArray(input.transactions)) return null
  if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) return null

  return {
    version: typeof input.version === 'number' ? input.version : 1,
    settings: { ...defaultSettings(), ...input.settings },
    transactions: input.transactions,
    budgets: input.budgets && typeof input.budgets === 'object' ? input.budgets : {},
    // Two collections gained sub-lists after v0; backfill so the UI can map them.
    goals: asArray(input.goals).map((goal) => ({ ...goal, contributions: asArray(goal.contributions) })),
    investments: asArray(input.investments).map((investment) => ({
      ...investment,
      history: asArray(investment.history),
    })),
    loans: asArray(input.loans),
    cards: asArray(input.cards),
    assets: asArray(input.assets),
    liabilities: asArray(input.liabilities),
    creditScores: asArray(input.creditScores),
    inquiries: asArray(input.inquiries),
    dismissedAlerts: asArray(input.dismissedAlerts),
  }
}

/** "412 transactions, 4 goals and 3 investments" — for the import confirmation. */
function describeState(state: AppState): string {
  const parts = [
    [state.transactions.length, 'transaction'],
    [state.goals.length, 'goal'],
    [state.investments.length, 'investment'],
    [state.loans.length, 'loan'],
    [state.cards.length, 'card'],
  ] as const

  const present = parts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`)

  if (present.length === 0) return 'no records'
  if (present.length === 1) return present[0]
  return `${present.slice(0, -1).join(', ')} and ${present[present.length - 1]}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function ordinal(day: number): string {
  // 11th–13th break the last-digit rule, so they are special-cased first.
  const rest = day % 100
  if (rest >= 11 && rest <= 13) return `${day}th`
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}
