# MoneyFlow

A premium personal-finance workspace: income, expenses, budgets, savings goals,
investments, loans, credit cards, net worth and financial-independence planning
in one place.

Everything runs in the browser. There is no backend, no account and no network
call — your data lives in this browser's local storage and nowhere else.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm run preview  # serve the production build
npm run lint
```

The app seeds itself with a realistic demo workspace on first run (₹80,000 salary,
₹25,000 rent, three SIPs, a gold holding, two loans, two credit cards and about a
year of transactions). Settings → Data lets you reset to that demo, start empty,
or export/import a JSON backup.

## What's in it

| Area | What it does |
|---|---|
| **Dashboard** | Total balance, monthly income/expenses, savings, investments, emergency-fund progress, budget snapshot, upcoming dues and the net-worth trend |
| **Transactions** | Full ledger with search, category/method/type filters, date ranges, sorting, bulk delete and PDF/Excel/CSV export |
| **Budget** | Per-category monthly limits, used-vs-remaining meters, pace marker, overspend alerts, default plans and auto-suggested limits |
| **Savings** | Goals with progress, contribution history, deadlines and a featured emergency-fund tracker |
| **Investments** | SIPs, mutual funds, stocks and gold — invested vs current value, profit/loss, allocation and a SIP calendar |
| **Loans & EMI** | EMI amounts, due dates, remaining tenure, outstanding balances and full amortisation schedules |
| **Credit cards** | Bills, due dates, minimum due, utilisation and a bill calendar |
| **Net worth** | Assets minus liabilities over time, composition breakdown and manual asset/liability entry |
| **Planning** | Salary-day allocation, cash-flow forecast and a financial-independence tracker with what-if scenarios |
| **Reports** | Monthly and yearly analysis with PDF and Excel export |
| **Settings** | Profile, theme, alert thresholds, planning assumptions and data management |

Reminders for upcoming EMIs, credit-card bills and budget breaches are derived
from state rather than stored, so they can never go stale after you pay something.

## How it is put together

```
src/
  types/          the domain model — everything is JSON-round-trippable
  lib/
    finance.ts    all derivations (EMI schedules, budgets, FI maths, forecasts)
    storage.ts    FinanceRepository + the local-storage implementation
    seed.ts       the deterministic demo workspace
    palette.ts    the validated chart palette
    export.ts     PDF and Excel generation (lazily loaded)
    date.ts       format.ts   cn.ts   id.ts
  store/          reducer + context; theme provider
  hooks/          hash router, media queries, dismiss handling
  components/
    ui/           Card, Button, Field, Modal, Badge, Progress, StatTile, Table…
    charts/       ChartFrame, TrendChart, ColumnChart, DonutChart, CategoryBars
    layout/       AppShell, Sidebar, NotificationCenter, GlobalSearch
    forms/        the shared transaction form
  pages/          one file per route
```

**`lib/finance.ts` is the only place financial logic lives.** It takes state in and
returns numbers out — no React, no storage — so the same functions serve the UI,
the PDF/Excel exporters and any future server.

### Ready for a backend

Feature code never touches `localStorage`. It goes through `FinanceRepository`:

```ts
export interface FinanceRepository {
  loadSync?(): AppState | null   // optional fast path; local storage has one
  load(): Promise<AppState | null>
  save(state: AppState): Promise<void>
  clear(): Promise<void>
}
```

Swapping in an HTTP or IndexedDB implementation means writing a new class and
changing the one `export const repository = …` line in `src/lib/storage.ts`.
Stored payloads pass through `migrate()` on read, so adding a field later doesn't
break existing saves.

## Design notes

**Theming.** Every colour is a CSS custom property declared once per theme and
exposed to Tailwind through `@theme inline`, which is what lets the whole palette
swap when `data-theme` changes on `<html>`. An inline script in `index.html`
applies the stored theme before first paint, so there is no flash of the wrong
mode. `system` follows the OS live.

**Charts.** The eight categorical series colours are a validated set: they pass
the lightness band, chroma floor, adjacent-pair colour-blind separation and
normal-vision separation checks against both the light (`#ffffff`) and dark
(`#12151c`) chart surfaces. Colour is assigned per *entity* (Food is always the
same hue) and never per rank, so filtering a category never repaints the others.
Three light-mode hues sit below 3:1 contrast on white, so every chart also ships
direct labels, a legend and a **table view** toggle — that table is the
accessibility relief for those hues, and it is what screen-reader and print users
read. No chart in the app uses two y-axes.

Status colours (good / warning / serious / critical) are reserved for state and
always render with an icon and a text label, never colour alone.

**Currency.** Figures use the Indian numbering system (₹1,50,000, not ₹150,000)
and compact forms use lakh/crore. One exception: PDF exports print `Rs.` because
jsPDF's built-in fonts have no ₹ glyph and would otherwise emit mojibake.

## Known limitations

- Net-worth history before today back-projects bank balances from each month's
  realised cash flow. Investment and loan balances use their real histories; the
  cash component is an estimate and the UI says so.
- Savings-goal contributions are transfers, not expenses, so they are tracked on
  the goal rather than in the transaction ledger. "Net saved" on the dashboard is
  income minus expenses, which is the money available to move into goals.
- `xlsx` is pinned at 0.18.5, the last npm release. Its known advisory affects the
  *parsing* path; this app only ever writes workbooks, and never parses
  spreadsheet input.
- Local storage is per-browser and per-origin. Clearing site data erases
  everything — use Settings → Export before you do.
