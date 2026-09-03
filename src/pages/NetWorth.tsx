import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Flag,
  Landmark,
  Minus,
  Pencil,
  PencilLine,
  Plus,
  Scale,
  Settings2,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import {
  isLiquidAsset,
  monthlySeries,
  netWorthBreakdown,
  netWorthHistory,
  sortAssets,
  sortLiabilities,
  summariseInvestments,
  totalSaved,
  yearsToTarget,
} from '../lib/finance'
import { addMonths, currentMonthKey, formatDate, monthLabel, monthRange, monthShort } from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  formatTenure,
  percentChange,
  progressPercent,
} from '../lib/format'
import { FLOW_COLORS, seriesColor, type Mode } from '../lib/palette'
import { ASSET_TYPES, LIABILITY_TYPES } from '../types'
import type { Asset, AssetType, Liability, LiabilityType } from '../types'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar } from '../components/ui/Progress'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { CurrencyInput, Field, SelectInput, TextInput } from '../components/ui/Field'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { TrendChart } from '../components/charts/TrendChart'
import { CategoryBars } from '../components/charts/CategoryBars'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

/**
 * Milestones sit every $25,000. Round enough to feel like a landmark, close
 * enough together that the next one is always within reach of a real plan.
 */
const MILESTONE_STEP = 25_000

/**
 * A fixed palette slot per composition row.
 *
 * `netWorthBreakdown` drops zero-value rows, so the array index shifts as
 * balances appear and disappear — paying a card off would otherwise repaint
 * every row beneath it. Colour follows the entity instead. Assets take the
 * cool slots, liabilities the warm ones, and all eight are distinct so the two
 * lists never imply a relationship that isn't there.
 */
const COMPOSITION_SLOT: Record<string, number> = {
  'Bank & cash': 0,
  Investments: 2,
  'Savings goals': 5,
  'Property & vehicles': 6,
  'Other assets': 3,
  'Loans outstanding': 1,
  'Credit card dues': 7,
  'Other liabilities': 4,
}

const ASSETS_ANCHOR = 'networth-assets'
const LIABILITIES_ANCHOR = 'networth-liabilities'

/**
 * Where each composition row is actually maintained. Half of this page is
 * derived from other screens and half is typed in below — every row says which
 * so nobody hunts for an "edit" button that was never going to exist.
 */
const COMPOSITION_SOURCE: Record<string, { meta: string; href?: string; anchor?: string }> = {
  'Bank & cash': { meta: 'You keep this current', anchor: ASSETS_ANCHOR },
  Investments: { meta: 'Live from your portfolio', href: '/investments' },
  'Savings goals': { meta: 'Live from goal balances', href: '/savings' },
  'Property & vehicles': { meta: 'You keep this current', anchor: ASSETS_ANCHOR },
  'Other assets': { meta: 'You keep this current', anchor: ASSETS_ANCHOR },
  'Loans outstanding': { meta: 'Live from loan schedules', href: '/loans' },
  'Credit card dues': { meta: 'Live from unpaid statements', href: '/cards' },
  'Other liabilities': { meta: 'You keep this current', anchor: LIABILITIES_ANCHOR },
}

function compositionColor(label: string, mode: Mode): string {
  return seriesColor(COMPOSITION_SLOT[label] ?? -1, mode)
}

type EditorState = { kind: 'asset'; entry?: Asset } | { kind: 'liability'; entry?: Liability }
type DeleteTarget = { kind: 'asset'; entry: Asset } | { kind: 'liability'; entry: Liability }

export default function NetWorth() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()
  const flow = FLOW_COLORS[mode]

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const breakdown = useMemo(() => netWorthBreakdown(state), [state])

  // Twelve months is both the chart window and the base for the headline move,
  // so the hero figure and the trend can never disagree about "last month".
  const history = useMemo(() => netWorthHistory(state, monthRange(12)), [state])

  const latest = history[history.length - 1]
  const priorMonth = history[history.length - 2]
  const netChange = latest.net - priorMonth.net
  const netChangePercent = percentChange(latest.net, priorMonth.net)
  const assetChange = percentChange(latest.assets, priorMonth.assets)
  const liabilityChange = percentChange(latest.liabilities, priorMonth.liabilities)

  const investments = useMemo(() => summariseInvestments(state.investments), [state.investments])
  const bankAndCash = state.assets.filter(isLiquidAsset).reduce((sum, asset) => sum + asset.value, 0)
  // Liquid net worth deliberately excludes property, vehicles and jewellery:
  // it answers "what could I actually settle up with", not "what am I worth".
  const liquidNetWorth = bankAndCash + investments.currentValue + totalSaved(state.goals) - breakdown.totalLiabilities

  const debtRatio = breakdown.totalAssets > 0 ? (breakdown.totalLiabilities / breakdown.totalAssets) * 100 : 0
  const debtStatus = debtRatio >= 70 ? 'critical' : debtRatio >= 50 ? 'serious' : debtRatio >= 30 ? 'warning' : 'good'

  const manualAssets = useMemo(() => sortAssets(state.assets), [state.assets])
  const manualLiabilities = useMemo(() => sortLiabilities(state.liabilities), [state.liabilities])
  const manualAssetTotal = manualAssets.reduce((sum, asset) => sum + asset.value, 0)
  const manualLiabilityTotal = manualLiabilities.reduce((sum, item) => sum + item.value, 0)

  const hasComposition = breakdown.assets.length > 0 || breakdown.liabilities.length > 0

  /* ---------------------------------------------------------------------- */
  /* Milestone                                                              */
  /* ---------------------------------------------------------------------- */

  const recentMonths = useMemo(() => monthlySeries(state.transactions, monthRange(6)), [state.transactions])
  const monthlySurplus = recentMonths.reduce((sum, row) => sum + row.net, 0) / (recentMonths.length || 1)

  const inDebt = breakdown.netWorth < 0
  const milestone = inDebt ? 0 : (Math.floor(breakdown.netWorth / MILESTONE_STEP) + 1) * MILESTONE_STEP
  const milestoneRemaining = Math.max(0, milestone - breakdown.netWorth)
  const milestonePercent = inDebt ? 0 : progressPercent(breakdown.netWorth, milestone)

  // Compounding only helps once the balance is positive, so climbing out of a
  // hole is plain division by the monthly surplus rather than a growth model.
  const yearsToMilestone =
    milestone > 0
      ? yearsToTarget(breakdown.netWorth, monthlySurplus, state.settings.expectedReturnRate, milestone)
      : monthlySurplus > 0
        ? Math.abs(breakdown.netWorth) / monthlySurplus / 12
        : null
  const monthsToMilestone = yearsToMilestone == null ? null : Math.max(1, Math.round(yearsToMilestone * 12))
  const milestoneMonth = monthsToMilestone == null ? null : addMonths(currentMonthKey(), monthsToMilestone)

  /* ---------------------------------------------------------------------- */
  /* Mutations                                                              */
  /* ---------------------------------------------------------------------- */

  function saveEntry(values: { name: string; type: string; value: number; institution?: string }) {
    if (!editor) return
    const previousValue = editor.entry?.value ?? 0
    // Same delta, opposite sign: an asset lifts net worth, a liability drags it.
    const delta = (values.value - previousValue) * (editor.kind === 'asset' ? 1 : -1)
    const projected = breakdown.netWorth + delta
    const verb = editor.entry ? 'updated' : 'added'

    if (editor.kind === 'asset') {
      const patch = {
        name: values.name,
        type: values.type as AssetType,
        value: values.value,
        institution: values.institution,
      }
      if (editor.entry) actions.updateAsset(editor.entry.id, patch)
      else actions.addAsset(patch)
    } else {
      const patch = { name: values.name, type: values.type as LiabilityType, value: values.value }
      if (editor.entry) actions.updateLiability(editor.entry.id, patch)
      else actions.addLiability(patch)
    }

    toast.success(`${values.name} ${verb} · net worth is now ${formatCurrency(projected)}`)
    setEditor(null)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const { kind, entry } = deleteTarget

    if (kind === 'asset') {
      actions.removeAsset(entry.id)
      toast.show(`${entry.name} removed from assets`, {
        tone: 'info',
        // Undo re-creates the row rather than resurrecting it, which is why the
        // toast promises "restored" and not "unchanged" — the id is new.
        action: {
          label: 'Undo',
          onClick: () => {
            actions.addAsset({ name: entry.name, type: entry.type, value: entry.value })
            toast.success(`${entry.name} restored`)
          },
        },
      })
    } else {
      actions.removeLiability(entry.id)
      toast.show(`${entry.name} removed from liabilities`, {
        tone: 'info',
        action: {
          label: 'Undo',
          onClick: () => {
            actions.addLiability({ name: entry.name, type: entry.type, value: entry.value })
            toast.success(`${entry.name} restored`)
          },
        },
      })
    }
    setDeleteTarget(null)
  }

  function openSource(label: string) {
    const source = COMPOSITION_SOURCE[label]
    if (!source) return
    if (source.href) {
      window.location.hash = hrefFor(source.href)
    } else if (source.anchor) {
      document.getElementById(source.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /* ---------------------------------------------------------------------- */

  const ChangeIcon = netChange > 0 ? ArrowUpRight : netChange < 0 ? ArrowDownRight : Minus
  const chartData = history.map((row) => ({
    label: monthShort(row.month),
    Assets: row.assets,
    Liabilities: row.liabilities,
    'Net worth': row.net,
  }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Net worth"
        subtitle="Everything you own, minus everything you owe — pulled together from every part of CreditCompass."
        action={
          <>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ kind: 'asset' })}>
              Add asset
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ kind: 'liability' })}>
              Add liability
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Hero: the single ≥42px figure on this page. */}
        <Card className="relative overflow-hidden lg:col-span-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-12 h-52 w-52 rounded-full opacity-[0.07]"
            style={{ background: `radial-gradient(circle, ${flow.net}, transparent 70%)` }}
          />
          <div className="relative flex h-full flex-col justify-between gap-5">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
                <Scale className="h-4 w-4" aria-hidden="true" />
                Net worth today
              </p>
              <p className="mt-2.5 text-[42px] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[48px]">
                {formatCurrency(breakdown.netWorth)}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-semibold',
                    netChange > 0 ? 'text-positive' : netChange < 0 ? 'text-negative' : 'text-muted',
                  )}
                >
                  <ChangeIcon className="h-4 w-4" aria-hidden="true" />
                  {formatSignedCurrency(netChange)}
                  {netChangePercent != null ? (
                    <span className="font-medium">({formatSignedPercent(netChangePercent)})</span>
                  ) : null}
                </span>
                <span className="text-muted">since {monthLabel(priorMonth.month)}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" icon={<Sparkles className="h-3 w-3" />}>
                Assets {formatCompactCurrency(breakdown.totalAssets)}
              </Badge>
              <Badge tone="neutral" icon={<Landmark className="h-3 w-3" />}>
                Owed {formatCompactCurrency(breakdown.totalLiabilities)}
              </Badge>
              <StatusBadge status={debtStatus}>
                {breakdown.totalAssets > 0 ? `${formatPercent(debtRatio, 0)} leveraged` : 'Nothing tracked yet'}
              </StatusBadge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setEditor({ kind: 'asset' })}
              >
                Add asset
              </Button>
              <Button size="sm" onClick={() => (window.location.hash = hrefFor('/investments'))}>
                Investments
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (window.location.hash = hrefFor('/loans'))}>
                Loans
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
          <StatTile
            label="Total assets"
            value={formatCurrency(breakdown.totalAssets)}
            sub={`${breakdown.assets.length} group${breakdown.assets.length === 1 ? '' : 's'} · ${manualAssets.length} entered by hand`}
            delta={assetChange}
            upIsGood
            icon={<Wallet className="h-4 w-4" />}
            accent={flow.income}
            trend={history.map((row) => row.assets)}
            trendColor={flow.income}
          />
          <StatTile
            label="Total liabilities"
            value={formatCurrency(breakdown.totalLiabilities)}
            sub={`Loans, card dues and ${manualLiabilities.length} manual entr${manualLiabilities.length === 1 ? 'y' : 'ies'}`}
            delta={liabilityChange}
            upIsGood={false}
            icon={<Landmark className="h-4 w-4" />}
            accent={flow.expense}
            trend={history.map((row) => row.liabilities)}
            trendColor={flow.expense}
            onClick={() => (window.location.hash = hrefFor('/loans'))}
          />
          <StatTile
            label="Liquid net worth"
            value={formatCurrency(liquidNetWorth)}
            sub="Bank, cash, investments and savings, less every debt. Property and vehicles are left out."
            icon={<Banknote className="h-4 w-4" />}
            accent={flow.net}
            onClick={() => (window.location.hash = hrefFor('/investments'))}
          />
          <StatTile
            label="Debt-to-asset ratio"
            value={breakdown.totalAssets > 0 ? formatPercent(debtRatio, 0) : '—'}
            sub={
              breakdown.totalAssets > 0 ? (
                <StatusBadge status={debtStatus}>
                  {debtRatio >= 70
                    ? 'Heavily leveraged'
                    : debtRatio >= 50
                      ? 'Watch the borrowing'
                      : debtRatio >= 30
                        ? 'Manageable'
                        : 'Comfortable'}
                </StatusBadge>
              ) : (
                'Add an asset to see this'
              )
            }
            icon={<Scale className="h-4 w-4" />}
            accent={flow.expense}
          />
        </div>
      </div>

      <MilestoneStrip
        inDebt={inDebt}
        milestone={milestone}
        percent={milestonePercent}
        remaining={milestoneRemaining}
        monthsAway={monthsToMilestone}
        targetMonth={milestoneMonth}
        monthlySurplus={monthlySurplus}
        returnRate={state.settings.expectedReturnRate}
      />

      <ChartFrame
        title="Net worth over time"
        subtitle="Assets, liabilities and the gap between them over the last twelve months"
        height={288}
        legend={[
          { label: 'Assets', color: flow.income },
          { label: 'Liabilities', color: flow.expense },
          { label: 'Net worth', color: flow.net },
        ]}
        table={{
          columns: ['Month', 'Assets', 'Liabilities', 'Net worth'],
          numericFrom: 1,
          rows: history.map((row) => [
            row.label,
            formatCurrency(row.assets),
            formatCurrency(row.liabilities),
            formatCurrency(row.net),
          ]),
        }}
        footnote="Bank balances before today are estimated from each month's realised cash flow; investments and loan balances use their actual histories."
        empty={
          hasComposition ? undefined : (
            <EmptyState
              icon={<Scale className="h-5 w-5" />}
              title="Nothing to chart yet"
              message="Add a bank balance, an investment or a loan and the trend fills in from there."
              action={
                <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ kind: 'asset' })}>
                  Add your first asset
                </Button>
              }
            />
          )
        }
      >
        <TrendChart
          data={chartData}
          xKey="label"
          series={[
            { key: 'Assets', label: 'Assets', color: flow.income, kind: 'area' },
            { key: 'Liabilities', label: 'Liabilities', color: flow.expense, kind: 'area' },
            { key: 'Net worth', label: 'Net worth', color: flow.net, kind: 'line' },
          ]}
        />
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <CompositionCard
          className="lg:col-span-6"
          title="What you own"
          subtitle={`${breakdown.assets.length} group${breakdown.assets.length === 1 ? '' : 's'} making up your assets`}
          icon={<Wallet className="h-4 w-4" />}
          rows={breakdown.assets}
          total={breakdown.totalAssets}
          totalLabel="Total assets"
          mode={mode}
          onSelect={openSource}
          emptyTitle="No assets tracked"
          emptyMessage="Add a bank balance below, or start an investment or savings goal."
          emptyAction={
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ kind: 'asset' })}>
              Add asset
            </Button>
          }
        />
        <CompositionCard
          className="lg:col-span-6"
          title="What you owe"
          subtitle={`${breakdown.liabilities.length} group${breakdown.liabilities.length === 1 ? '' : 's'} pulling against your assets`}
          icon={<Landmark className="h-4 w-4" />}
          rows={breakdown.liabilities}
          total={breakdown.totalLiabilities}
          totalLabel="Total liabilities"
          mode={mode}
          onSelect={openSource}
          emptyTitle="Debt free"
          emptyMessage="No loans, card dues or personal debts on record. Long may it last."
          emptyAction={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ kind: 'liability' })}>
              Add liability
            </Button>
          }
        />
      </div>

      <SourcesCaption manualAssets={manualAssets.length} manualLiabilities={manualLiabilities.length} />

      <LedgerCard
        anchorId={ASSETS_ANCHOR}
        title="Assets you keep up to date"
        subtitle="Balances CreditCompass cannot see for itself — chequing, savings, cash, property, vehicles"
        icon={<Wallet className="h-4 w-4" />}
        nameHeading="Asset"
        valueHeading="Value"
        rows={manualAssets}
        total={manualAssetTotal}
        totalLabel="Total entered by hand"
        addLabel="Add asset"
        onAdd={() => setEditor({ kind: 'asset' })}
        onEdit={(id) => {
          const asset = state.assets.find((item) => item.id === id)
          if (asset) setEditor({ kind: 'asset', entry: asset })
        }}
        onDelete={(id) => {
          const asset = state.assets.find((item) => item.id === id)
          if (asset) setDeleteTarget({ kind: 'asset', entry: asset })
        }}
        emptyTitle="No manual assets yet"
        emptyMessage="Your chequing balance is the one number this page cannot work out on its own — add it first."
      />

      <LedgerCard
        anchorId={LIABILITIES_ANCHOR}
        title="Liabilities you keep up to date"
        subtitle="Debts outside loans and credit cards — money borrowed from family, tax payable, deposits due"
        icon={<CreditCard className="h-4 w-4" />}
        nameHeading="Liability"
        valueHeading="Amount owed"
        rows={manualLiabilities}
        total={manualLiabilityTotal}
        totalLabel="Total entered by hand"
        addLabel="Add liability"
        onAdd={() => setEditor({ kind: 'liability' })}
        onEdit={(id) => {
          const liability = state.liabilities.find((item) => item.id === id)
          if (liability) setEditor({ kind: 'liability', entry: liability })
        }}
        onDelete={(id) => {
          const liability = state.liabilities.find((item) => item.id === id)
          if (liability) setDeleteTarget({ kind: 'liability', entry: liability })
        }}
        emptyTitle="Nothing owed here"
        emptyMessage="Loans and card dues are tracked on their own pages — this list is for everything else."
      />

      {/* Mounting the editor only while it is open means every open starts from
          a clean draft, with no stale state to reset. */}
      {editor ? (
        <EntryFormModal kind={editor.kind} entry={editor.entry} onClose={() => setEditor(null)} onSave={saveEntry} />
      ) : null}

      <ConfirmDialog
        open={deleteTarget != null}
        title={`Delete ${deleteTarget?.entry.name ?? 'this entry'}?`}
        message={
          deleteTarget ? (
            <>
              Removing <strong className="font-medium text-ink">{deleteTarget.entry.name}</strong> (
              {formatCurrency(deleteTarget.entry.value)}) moves your net worth to{' '}
              <strong className="font-medium text-ink">
                {formatCurrency(
                  breakdown.netWorth + (deleteTarget.kind === 'asset' ? -deleteTarget.entry.value : deleteTarget.entry.value),
                )}
              </strong>
              . You can undo this straight after.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Milestone                                                                  */
/* -------------------------------------------------------------------------- */

function MilestoneStrip({
  inDebt,
  milestone,
  percent,
  remaining,
  monthsAway,
  targetMonth,
  monthlySurplus,
  returnRate,
}: {
  inDebt: boolean
  milestone: number
  percent: number
  remaining: number
  monthsAway: number | null
  targetMonth: string | null
  monthlySurplus: number
  returnRate: number
}) {
  return (
    <Card>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex shrink-0 items-start gap-3 lg:w-56">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
            <Flag className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-muted">{inDebt ? 'Back to zero' : 'Next milestone'}</p>
            <p className="tabular mt-0.5 text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
              {formatCurrency(milestone)}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <ProgressBar
            value={percent}
            size="lg"
            tone={inDebt ? 'critical' : 'brand'}
            label="Progress towards the next net-worth milestone"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px]">
            <span className="text-muted">
              {inDebt ? 'Net worth is below zero' : `${formatPercent(percent, 0)} of the way there`}
            </span>
            <span className="tabular font-medium text-ink-secondary">{formatCurrency(remaining)} to go</span>
          </div>
        </div>

        <div className="shrink-0 lg:w-60 lg:text-right">
          <p className="text-[13px] font-medium text-muted">Projected arrival</p>
          {monthsAway != null && targetMonth ? (
            <>
              <p className="mt-0.5 text-[15px] font-semibold text-ink">{monthLabel(targetMonth, true)}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                About {formatTenure(monthsAway)} away at {formatCurrency(Math.max(0, monthlySurplus))} a month
                {inDebt ? '' : ` and ${formatPercent(returnRate, 0)} returns`}.
              </p>
            </>
          ) : (
            <div className="mt-1.5 flex lg:justify-end">
              <StatusBadge status="warning">Not on this trajectory</StatusBadge>
            </div>
          )}
          {monthsAway == null ? (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              Your last six months averaged {formatSignedCurrency(monthlySurplus)} a month. A positive surplus is what
              moves this.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

function CompositionCard({
  className,
  title,
  subtitle,
  icon,
  rows,
  total,
  totalLabel,
  mode,
  onSelect,
  emptyTitle,
  emptyMessage,
  emptyAction,
}: {
  className?: string
  title: string
  subtitle: string
  icon: ReactNode
  rows: { label: string; value: number }[]
  total: number
  totalLabel: string
  mode: Mode
  onSelect: (label: string) => void
  emptyTitle: string
  emptyMessage: string
  emptyAction: ReactNode
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      {rows.length === 0 ? (
        <EmptyState className="mt-4" compact title={emptyTitle} message={emptyMessage} action={emptyAction} />
      ) : (
        <CategoryBars
          className="mt-2 flex-1"
          items={rows.map((row) => ({
            label: row.label,
            value: row.value,
            color: compositionColor(row.label, mode),
            share: total > 0 ? (row.value / total) * 100 : 0,
            meta: COMPOSITION_SOURCE[row.label]?.meta,
          }))}
          onSelect={(item) => onSelect(item.label)}
        />
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-[13px] font-medium text-ink">{totalLabel}</span>
        <span className="tabular text-[15px] font-semibold text-ink">{formatCurrency(total)}</span>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Provenance caption                                                         */
/* -------------------------------------------------------------------------- */

function SourcesCaption({ manualAssets, manualLiabilities }: { manualAssets: number; manualLiabilities: number }) {
  return (
    <Card>
      <CardHeader
        title="Where these numbers come from"
        subtitle="Half of this page maintains itself. The other half is yours to keep honest."
        icon={<Settings2 className="h-4 w-4" />}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Settings2 className="h-4 w-4 text-brand" aria-hidden="true" />
            Calculated automatically
          </p>
          <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-secondary">
            <li>
              <SourceLink href="/investments">Investments</SourceLink> — the current value of every holding, refreshed
              whenever you update the portfolio.
            </li>
            <li>
              <SourceLink href="/savings">Savings goals</SourceLink> — the total put away across all goals, from your
              contribution log.
            </li>
            <li>
              <SourceLink href="/loans">Loans outstanding</SourceLink> — remaining principal from each amortisation
              schedule, so it falls with every payment you record.
            </li>
            <li>
              <SourceLink href="/cards">Credit card dues</SourceLink> — unpaid statement balances; marking a bill paid
              clears it from here the same moment.
            </li>
          </ul>
          <p className="mt-3 text-[11.5px] text-muted">
            Editing these here would only get overwritten — change them on their own pages.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <PencilLine className="h-4 w-4 text-brand" aria-hidden="true" />
            Entered by you
          </p>
          <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-secondary">
            <li>
              <strong className="font-medium text-ink">Chequing, savings and cash</strong> — nothing connects to your bank,
              so this is the one figure worth refreshing each month.
            </li>
            <li>
              <strong className="font-medium text-ink">Property and vehicles</strong> — record today's resale
              value, not what you paid for it.
            </li>
            <li>
              <strong className="font-medium text-ink">Other assets</strong> — money owed to you, or
              anything else of value.
            </li>
            <li>
              <strong className="font-medium text-ink">Personal debts, tax payable, deposits due</strong> — everything
              you owe that is not a formal loan or a card bill.
            </li>
          </ul>
          <p className="mt-3 text-[11.5px] text-muted">
            {manualAssets} asset{manualAssets === 1 ? '' : 's'} and {manualLiabilities} liabilit
            {manualLiabilities === 1 ? 'y' : 'ies'} on file — edit them in the two tables below.
          </p>
        </div>
      </div>
    </Card>
  )
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={hrefFor(href)} className="font-medium text-brand hover:underline">
      {children}
    </a>
  )
}

/* -------------------------------------------------------------------------- */
/* Manual ledgers                                                             */
/* -------------------------------------------------------------------------- */

interface LedgerRow {
  id: string
  name: string
  type: string
  institution?: string
  value: number
  updatedAt: string
}

function LedgerCard({
  anchorId,
  title,
  subtitle,
  icon,
  nameHeading,
  valueHeading,
  rows,
  total,
  totalLabel,
  addLabel,
  onAdd,
  onEdit,
  onDelete,
  emptyTitle,
  emptyMessage,
}: {
  anchorId: string
  title: string
  subtitle: string
  icon: ReactNode
  nameHeading: string
  valueHeading: string
  rows: LedgerRow[]
  total: number
  totalLabel: string
  addLabel: string
  onAdd: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  emptyTitle: string
  emptyMessage: string
}) {
  return (
    // scroll-mt keeps the heading clear of the sticky app bar when the
    // composition bars jump down here.
    <div id={anchorId} className="scroll-mt-24">
      <Card>
        <CardHeader
          title={title}
          subtitle={subtitle}
          icon={icon}
          action={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
              {addLabel}
            </Button>
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Wallet className="h-5 w-5" />}
            title={emptyTitle}
            message={emptyMessage}
            action={
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
                {addLabel}
              </Button>
            }
          />
        ) : (
          <TableWrap className="mt-3">
            <thead>
              <tr>
                <Th>{nameHeading}</Th>
                <Th>Type</Th>
                <Th align="right">{valueHeading}</Th>
                <Th>Last updated</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td className="font-medium whitespace-nowrap">{row.name}</Td>
                  <Td className="whitespace-nowrap text-ink-secondary">
                    {row.institution ? `${row.institution} · ${row.type}` : row.type}
                  </Td>
                  <Td align="right" className="tabular font-semibold whitespace-nowrap">
                    {formatCurrency(row.value)}
                  </Td>
                  {/* Seeded rows may carry a full timestamp; the day is all we show. */}
                  <Td className="whitespace-nowrap text-[12.5px] text-muted">{formatDate(row.updatedAt.slice(0, 10))}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <IconButton label={`Edit ${row.name}`} size="sm" onClick={() => onEdit(row.id)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Delete ${row.name}`} size="sm" onClick={() => onDelete(row.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <Td colSpan={2} className="text-[12.5px] font-medium text-muted">
                  {totalLabel}
                </Td>
                <Td align="right" className="tabular font-semibold whitespace-nowrap">
                  {formatCurrency(total)}
                </Td>
                <Td colSpan={2} />
              </tr>
            </tfoot>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Add / edit modal                                                           */
/* -------------------------------------------------------------------------- */

function EntryFormModal({
  kind,
  entry,
  onClose,
  onSave,
}: {
  kind: 'asset' | 'liability'
  entry?: Asset | Liability
  onClose: () => void
  onSave: (values: { name: string; type: string; value: number; institution?: string }) => void
}) {
  // useId can contain characters that are awkward in an `id` attribute; the
  // footer button reaches this form by id, so keep it plain.
  const fieldId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const formId = `networth-entry-${fieldId}`
  const isAsset = kind === 'asset'
  const types: readonly string[] = isAsset ? ASSET_TYPES : LIABILITY_TYPES

  const [name, setName] = useState(entry?.name ?? '')
  const [type, setType] = useState<string>(entry?.type ?? types[0])
  const [value, setValue] = useState(entry ? String(entry.value) : '')
  // Only assets carry an institution; liabilities are described by their name.
  const [institution, setInstitution] = useState(isAsset ? ((entry as Asset | undefined)?.institution ?? '') : '')
  // Errors stay quiet until the first submit — nobody wants to be told a field
  // is empty before they have had a chance to fill it in.
  const [submitted, setSubmitted] = useState(false)

  const amount = Number(value)
  const nameError = name.trim() ? undefined : 'Give this a name you will recognise later.'
  const valueError =
    value.trim() === '' || !Number.isFinite(amount) || amount <= 0 ? 'Enter an amount greater than zero.' : undefined

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (nameError || valueError) return
    onSave({
      name: name.trim(),
      type,
      value: Math.round(amount * 100) / 100,
      institution: isAsset ? institution.trim() || undefined : undefined,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={entry ? `Edit ${isAsset ? 'asset' : 'liability'}` : `Add ${isAsset ? 'an asset' : 'a liability'}`}
      description={
        isAsset
          ? 'Anything you own that CreditCompass cannot see — investments and savings goals are already counted.'
          : 'Anything you owe outside loans and credit cards — those two keep themselves up to date.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            {entry ? 'Save changes' : addLabelFor(isAsset)}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" required error={submitted ? nameError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              value={name}
              autoComplete="off"
              placeholder={isAsset ? 'CIBC Smart Account' : 'Borrowed from family'}
              invalid={submitted && Boolean(nameError)}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        {isAsset ? (
          <Field label="Institution" hint="Optional — CIBC, Wealthsimple, Tangerine…">
            {(id) => (
              <TextInput
                id={id}
                value={institution}
                autoComplete="off"
                placeholder="CIBC"
                onChange={(event) => setInstitution(event.target.value)}
              />
            )}
          </Field>
        ) : null}

        <Field label="Type" required>
          {(id) => (
            <SelectInput id={id} value={type} onChange={(event) => setType(event.target.value)}>
              {types.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>

        <Field
          label={isAsset ? "Today's value" : 'Amount owed'}
          required
          error={submitted ? valueError : undefined}
          hint={
            valueError == null
              ? `${formatCompactCurrency(amount)} — ${isAsset ? 'adds to' : 'comes off'} your net worth`
              : isAsset
                ? 'Use what it would fetch today, not what you paid.'
                : 'The balance still outstanding, not the original amount.'
          }
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={value}
              placeholder="0"
              invalid={submitted && Boolean(valueError)}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}

function addLabelFor(isAsset: boolean): string {
  return isAsset ? 'Add asset' : 'Add liability'
}
