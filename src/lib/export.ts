/**
 * Report export — PDF and Excel, both generated entirely in the browser.
 *
 * jsPDF's built-in fonts are WinAnsi, which carries `$` but not most other
 * currency marks — so the same `formatCurrency` serves the PDF, the workbook
 * and the screen without a substitution step.
 */

import type { jsPDF } from 'jspdf'
import type * as XLSXNamespace from 'xlsx'
import type { AppState, Transaction } from '../types'
import {
  budgetRows,
  categoryBreakdown,
  monthTotals,
  monthlySeries,
  netWorthBreakdown,
  savingsGrowth,
  summariseGoal,
  summariseInvestments,
  summariseLoan,
  totalCardOutstanding,
  yearSummary,
} from './finance'
import { formatDate, monthLabel, monthRange, todayISO } from './date'
import { formatCurrency } from './format'
import { APP_NAME, FILE_PREFIX } from './brand'

const BRAND: [number, number, number] = [42, 120, 214]
const INK: [number, number, number] = [11, 15, 25]
const MUTED: [number, number, number] = [125, 134, 149]

/**
 * jsPDF, autotable and SheetJS together are ~450 kB — far more than the rest of
 * the app. Loading them only when someone actually exports keeps the first
 * paint light; the chunks arrive while the click is still being handled.
 */
async function loadPdf() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable: autoTableModule.default }
}

async function loadXlsx(): Promise<typeof XLSXNamespace> {
  return import('xlsx')
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next tick so Safari has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                        */
/* -------------------------------------------------------------------------- */

interface PdfContext {
  doc: jsPDF
  cursor: number
  autoTable: Awaited<ReturnType<typeof loadPdf>>['autoTable']
}

async function startPdf(title: string, subtitle: string, owner: string): Promise<PdfContext> {
  const { jsPDF, autoTable } = await loadPdf()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, width, 76, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(APP_NAME, 40, 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(title, 40, 52)
  doc.setFontSize(8.5)
  doc.text(`${subtitle}  ·  ${owner}  ·  Generated ${formatDate(todayISO())}`, 40, 66)

  return { doc, cursor: 104, autoTable }
}

function sectionTitle(ctx: PdfContext, text: string) {
  ctx.doc.setTextColor(...INK)
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(11)
  ctx.doc.text(text, 40, ctx.cursor)
  ctx.cursor += 14
}

/** A row of KPI boxes — the headline numbers before any table. */
function kpiRow(ctx: PdfContext, items: { label: string; value: string }[]) {
  const { doc } = ctx
  const width = doc.internal.pageSize.getWidth()
  const gap = 10
  const boxWidth = (width - 80 - gap * (items.length - 1)) / items.length

  items.forEach((item, index) => {
    const x = 40 + index * (boxWidth + gap)
    doc.setDrawColor(224, 228, 234)
    doc.setFillColor(248, 249, 251)
    doc.roundedRect(x, ctx.cursor, boxWidth, 46, 5, 5, 'FD')
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(item.label.toUpperCase(), x + 9, ctx.cursor + 16)
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(item.value, x + 9, ctx.cursor + 34)
  })
  ctx.cursor += 62
}

function table(ctx: PdfContext, head: string[], body: (string | number)[][], rightAlignFrom = 1) {
  ctx.autoTable(ctx.doc, {
    head: [head],
    body,
    startY: ctx.cursor,
    margin: { left: 40, right: 40 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, lineColor: [230, 233, 238], lineWidth: 0.5, textColor: INK },
    headStyles: { fillColor: [242, 244, 247], textColor: INK, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [251, 252, 253] },
    columnStyles: Object.fromEntries(
      head.map((_, index) => [index, index >= rightAlignFrom ? { halign: 'right' as const } : {}]),
    ),
  })
  const result = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.cursor = (result?.finalY ?? ctx.cursor) + 24
}

function finishPdf(doc: jsPDF, filename: string) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated by ${APP_NAME} — figures are indicative, not financial advice.`, 40, height - 22)
    doc.text(`Page ${page} of ${pages}`, width - 40, height - 22, { align: 'right' })
  }
  download(doc.output('blob'), filename)
}

/** Month report: totals, category split, budget performance and the ledger. */
export async function exportMonthlyPdf(state: AppState, month: string): Promise<void> {
  const totals = monthTotals(state.transactions, month)
  const ctx = await startPdf('Monthly financial report', monthLabel(month, true), state.settings.name)

  kpiRow(ctx, [
    { label: 'Income', value: formatCurrency(totals.income) },
    { label: 'Expenses', value: formatCurrency(totals.expense) },
    { label: 'Net saved', value: formatCurrency(totals.net) },
    { label: 'Savings rate', value: `${totals.savingsRate.toFixed(1)}%` },
  ])

  const rows = state.transactions.filter((t) => t.date.startsWith(month))
  const breakdown = categoryBreakdown(rows, 'expense')
  if (breakdown.length) {
    sectionTitle(ctx, 'Where the money went')
    table(
      ctx,
      ['Category', 'Amount', 'Share', 'Entries'],
      breakdown.map((row) => [row.category, formatCurrency(row.amount), `${row.share.toFixed(1)}%`, row.count]),
    )
  }

  const budgets = budgetRows(state, month).filter((row) => row.limit > 0)
  if (budgets.length) {
    sectionTitle(ctx, 'Budget performance')
    table(
      ctx,
      ['Category', 'Budget', 'Spent', 'Remaining', 'Used'],
      budgets.map((row) => [
        row.category,
        formatCurrency(row.limit),
        formatCurrency(row.spent),
        formatCurrency(row.remaining),
        `${Math.round(row.usedPercent)}%`,
      ]),
    )
  }

  if (rows.length) {
    sectionTitle(ctx, 'Transactions')
    table(
      ctx,
      ['Date', 'Description', 'Category', 'Method', 'Amount'],
      [...rows]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => [
          formatDate(t.date),
          t.note,
          t.category,
          t.method,
          `${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}`,
        ]),
      4,
    )
  }

  finishPdf(ctx.doc, `${FILE_PREFIX}-${month}-report.pdf`)
}

/** Year report: month-by-month table plus the full financial position. */
export async function exportYearlyPdf(state: AppState, year: number): Promise<void> {
  const summary = yearSummary(state.transactions, year)
  const worth = netWorthBreakdown(state)
  const investments = summariseInvestments(state.investments)
  const ctx = await startPdf('Yearly financial summary', String(year), state.settings.name)

  kpiRow(ctx, [
    { label: 'Total income', value: formatCurrency(summary.income) },
    { label: 'Total expenses', value: formatCurrency(summary.expense) },
    { label: 'Net saved', value: formatCurrency(summary.net) },
    { label: 'Savings rate', value: `${summary.savingsRate.toFixed(1)}%` },
  ])

  sectionTitle(ctx, 'Month by month')
  table(
    ctx,
    ['Month', 'Income', 'Expenses', 'Net', 'Savings rate'],
    summary.months.map((row) => [
      row.label,
      formatCurrency(row.income),
      formatCurrency(row.expense),
      formatCurrency(row.net),
      `${row.savingsRate.toFixed(1)}%`,
    ]),
  )

  sectionTitle(ctx, 'Category spending')
  table(
    ctx,
    ['Category', 'Amount', 'Share'],
    categoryBreakdown(
      state.transactions.filter((t) => t.date.startsWith(String(year))),
      'expense',
    ).map((row) => [row.category, formatCurrency(row.amount), `${row.share.toFixed(1)}%`]),
  )

  sectionTitle(ctx, 'Financial position')
  table(
    ctx,
    ['Item', 'Value'],
    [
      ['Total assets', formatCurrency(worth.totalAssets)],
      ['Total liabilities', formatCurrency(worth.totalLiabilities)],
      ['Net worth', formatCurrency(worth.netWorth)],
      ['Investments invested', formatCurrency(investments.invested)],
      ['Investments current value', formatCurrency(investments.currentValue)],
      ['Unrealised gain / loss', formatCurrency(investments.gain)],
      ['Credit card dues', formatCurrency(totalCardOutstanding(state.cards))],
    ],
  )

  finishPdf(ctx.doc, `${FILE_PREFIX}-${year}-summary.pdf`)
}

/** Whatever the user is currently looking at on the Transactions page. */
export async function exportTransactionsPdf(
  state: AppState,
  transactions: Transaction[],
  label: string,
): Promise<void> {
  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const ctx = await startPdf('Transaction statement', label, state.settings.name)

  kpiRow(ctx, [
    { label: 'Entries', value: String(transactions.length) },
    { label: 'Income', value: formatCurrency(income) },
    { label: 'Expenses', value: formatCurrency(expense) },
    { label: 'Net', value: formatCurrency(income - expense) },
  ])

  table(
    ctx,
    ['Date', 'Description', 'Category', 'Method', 'Amount'],
    [...transactions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        formatDate(t.date),
        t.note,
        t.category,
        t.method,
        `${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}`,
      ]),
    4,
  )

  finishPdf(ctx.doc, `${FILE_PREFIX}-transactions.pdf`)
}

/* -------------------------------------------------------------------------- */
/* Excel                                                                      */
/* -------------------------------------------------------------------------- */

function sheetFromRows(
  XLSX: typeof XLSXNamespace,
  rows: (string | number)[][],
  widths: number[],
): XLSXNamespace.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = widths.map((width) => ({ wch: width }))
  return sheet
}

export async function exportTransactionsExcel(
  transactions: Transaction[],
  filename = `${FILE_PREFIX}-transactions.xlsx`,
): Promise<void> {
  const XLSX = await loadXlsx()
  const book = XLSX.utils.book_new()
  const rows: (string | number)[][] = [
    ['Date', 'Type', 'Category', 'Description', 'Method', 'Amount'],
    ...[...transactions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [t.date, t.type === 'income' ? 'Income' : 'Expense', t.category, t.note, t.method, t.type === 'income' ? t.amount : -t.amount]),
  ]
  XLSX.utils.book_append_sheet(book, sheetFromRows(XLSX, rows, [12, 10, 16, 34, 15, 14]), 'Transactions')
  XLSX.writeFile(book, filename)
}

/** The whole workspace as a multi-sheet workbook. */
export async function exportWorkbook(
  state: AppState,
  filename = `${FILE_PREFIX}-report.xlsx`,
): Promise<void> {
  const XLSX = await loadXlsx()
  const book = XLSX.utils.book_new()
  const months = monthRange(12)
  const series = monthlySeries(state.transactions, months)
  const worth = netWorthBreakdown(state)
  const investments = summariseInvestments(state.investments)

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows(
      XLSX,
      [
        [`${APP_NAME} financial summary`],
        ['Owner', state.settings.name],
        ['Generated', formatDate(todayISO())],
        [],
        ['Position', 'Amount (CAD)'],
        ['Total assets', worth.totalAssets],
        ['Total liabilities', worth.totalLiabilities],
        ['Net worth', worth.netWorth],
        ['Invested', investments.invested],
        ['Portfolio value', investments.currentValue],
        ['Unrealised gain/loss', investments.gain],
        [],
        ['Month', 'Income', 'Expenses', 'Net', 'Savings rate %'],
        ...series.map((row) => [row.label, row.income, row.expense, row.net, Number(row.savingsRate.toFixed(2))]),
      ],
      [26, 16, 14, 14, 15],
    ),
    'Summary',
  )

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows(
      XLSX,
      [
        ['Date', 'Type', 'Category', 'Description', 'Method', 'Amount'],
        ...[...state.transactions]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((t) => [t.date, t.type === 'income' ? 'Income' : 'Expense', t.category, t.note, t.method, t.type === 'income' ? t.amount : -t.amount]),
      ],
      [12, 10, 16, 34, 15, 14],
    ),
    'Transactions',
  )

  const currentMonth = months[months.length - 1]
  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows(
      XLSX,
      [
        [`Budget — ${monthLabel(currentMonth, true)}`],
        ['Category', 'Budget', 'Spent', 'Remaining', 'Used %'],
        ...budgetRows(state, currentMonth).map((row) => [
          row.category,
          row.limit,
          row.spent,
          row.remaining,
          Number(row.usedPercent.toFixed(1)),
        ]),
      ],
      [20, 14, 14, 14, 10],
    ),
    'Budget',
  )

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows(
      XLSX,
      [
        ['Goal', 'Target', 'Saved', 'Remaining', 'Progress %', 'Monthly', 'Deadline'],
        ...state.goals.map((goal) => {
          const summary = summariseGoal(goal)
          return [
            goal.name,
            goal.target,
            goal.saved,
            summary.remaining,
            Number(summary.percent.toFixed(1)),
            goal.monthlyContribution ?? 0,
            goal.deadline ?? '—',
          ]
        }),
        [],
        ['Savings balance by month'],
        ['Month', 'Total saved'],
        ...savingsGrowth(state.goals, months).map((row) => [row.label, row.total]),
      ],
      [26, 14, 14, 14, 12, 12, 14],
    ),
    'Savings',
  )

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows(
      XLSX,
      [
        ['Holding', 'Type', 'Invested', 'Current value', 'Gain/Loss', 'Return %', 'Monthly contribution', 'Started'],
        ...state.investments.map((inv) => [
          inv.name,
          inv.type,
          inv.invested,
          inv.currentValue,
          inv.currentValue - inv.invested,
          inv.invested ? Number((((inv.currentValue - inv.invested) / inv.invested) * 100).toFixed(2)) : 0,
          inv.monthlyAmount ?? 0,
          inv.startDate,
        ]),
      ],
      [28, 14, 14, 16, 14, 11, 13, 13],
    ),
    'Investments',
  )

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows(
      XLSX,
      [
        ['Loan', 'Lender', 'Principal', 'Rate %', 'Payment', 'Paid', 'Tenure', 'Outstanding', 'Next due'],
        ...state.loans.map((loan) => {
          const summary = summariseLoan(loan)
          return [
            loan.name,
            loan.lender,
            loan.principal,
            loan.interestRate,
            loan.paymentAmount,
            loan.paidMonths,
            loan.tenureMonths,
            summary.outstanding,
            summary.nextDueDate,
          ]
        }),
        [],
        ['Card', 'Issuer', 'Limit', 'Outstanding', 'Minimum due', 'Bill due day'],
        ...state.cards.map((card) => [
          card.name,
          card.issuer,
          card.creditLimit,
          card.outstanding,
          card.minimumDue,
          card.billDueDay,
        ]),
      ],
      [24, 18, 14, 10, 13, 8, 9, 15, 13],
    ),
    'Debt',
  )

  XLSX.writeFile(book, filename)
}

/** Plain-text CSV fallback — opens anywhere, no library quirks. */
export function exportTransactionsCsv(transactions: Transaction[]): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [
    ['Date', 'Type', 'Category', 'Description', 'Method', 'Amount'].join(','),
    ...[...transactions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) =>
        [
          t.date,
          t.type,
          escape(t.category),
          escape(t.note),
          escape(t.method),
          String(t.type === 'income' ? t.amount : -t.amount),
        ].join(','),
      ),
  ]
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${FILE_PREFIX}-transactions.csv`)
}

/** Human-readable label for whatever range the user exported. */
export function rangeLabel(from: string, to: string): string {
  return `${formatDate(from)} — ${formatDate(to)}`
}

export { formatCurrency }
