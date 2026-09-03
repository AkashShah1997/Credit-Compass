# CreditCompass

A personal credit-health and money workspace for Canadians. It exists to answer
one question every month: **what is my credit score doing, why, and what do I do
next?** — and then to give you the rest of your finances (income, budgets,
savings, investments, loans, cards, net worth, planning) in the same place, in
Canadian dollars, with Canadian account types.

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

The app seeds itself with a demo workspace on first run: a CIBC chequing and
savings account, Wealthsimple Cash, TFSA and RRSP, one CIBC Visa running at 61%
of its limit, an auto loan opened ten months ago, the hard inquiry that came
with it, and a year of Equifax readings that drop from the low 740s to the high
660s and stay there. That is the situation the app was built for, so every
recommendation lights up straight away. Settings → Data lets you reset to that
demo, start empty, or export/import a JSON backup.

## Deploying

It is a static site. Push the repository to GitHub and import it in Vercel:

- Framework preset: **Vite** (auto-detected). Build command `npm run build`,
  output directory `dist`, no environment variables.
- Routing is hash-based (`/#/cards`), so there are nothing to rewrite — every
  URL is served by `index.html`.
- [`vercel.json`](vercel.json) only adds privacy and hardening headers
  (`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and so on).
- Node 22 is pinned in `package.json` for the build.

Nothing you enter ever leaves the browser: there is no API, no analytics and no
network call. Local storage is scoped to the origin, so a preview deployment
has its own empty workspace and cannot see production data — export a JSON
backup from Settings if you want to carry data across.

## Credit health — the home page

| Panel | What it does |
|---|---|
| **Monthly check-in** | The whole routine on one screen, thirty seconds a month: the score you just saw, the new statement balance on each card, and whether the loan payment went through. Everything else is entered once — there is nothing to import |
| **Score** | Latest reading with its Equifax band (Poor → Excellent), a ring toward your goal, the change since your last reading and since your newest account, points to the next band |
| **What to do next** | An ordered list of concrete actions built from *your* balances and dates — e.g. "Pay $2,481 on CIBC Dividend Visa before the 25th — reported utilization 61% → under 30%". Each carries an impact rating and a timing |
| **Score history** | One line per bureau (they are never compared to each other), your goal as a reference line, and vertical markers where a loan was opened or a lender pulled your file |
| **Utilization by account** | Every card and line of credit against the 10% and 30% ticks, with the statement date it will be reported on and the exact amount to pay before then |
| **Five factors** | Payment history, utilization, length of history, credit mix, new credit — weighted the way the bureaus describe them, each with a status and the reason for it |
| **Hard inquiries** | When each one stops counting (about a year) and when it drops off the report (about three) |
| **Timeline** | Readings, inquiries and account openings in one list — the story behind the line |
| **Ask an AI** | Builds an anonymous plain-text briefing from your numbers — scores, accounts, inquiries, cash-flow context, the app's own suggestions — to paste into ChatGPT, Claude, Gemini or any assistant for a second opinion |

Scores are logged by hand. No Canadian bureau exposes a consumer API, so the app
asks for one reading a month from a free source — Borrowell or the CIBC app for
Equifax, Credit Karma for TransUnion — and works everything else out from the
accounts you have entered. Only three things change month to month (the score,
each card's statement balance, the loan payment), and the check-in asks for
exactly those. The engine encodes the publicly documented way
Canadian scores are weighed; it is general guidance, not either bureau's
formula, and the page says so.

### What the recommendation engine looks at

Every rule in `src/lib/credit.ts` is guarded by the data that triggers it, so a
file in good shape gets one line, not a lecture. In priority order:

1. Anything past due on a card or a loan — payment history is ~35% of the score
2. Any account at or above 30% utilization — with the dollars to pay before the
   *statement* date (that is the balance bureaus see, not what you pay by the due date)
3. Interest cost of a carried balance, when you have entered the card's APR
4. A single revolving account — ask the issuer for a limit increase (often a
   soft check) rather than opening a card while an inquiry is fresh
5. An account under a year old — the expected 40–80 point dip, how many on-time
   payments have accrued, and the 12–18 month window most of it comes back in
6. Hard inquiries still counting — hold off on applications until the date it clears
7. Dormant cards, stale score readings, and protecting your oldest account

## The rest of the app

| Area | What it does |
|---|---|
| **Money overview** | Total balance, monthly income/expenses, savings, investments, emergency-fund progress, budget snapshot, upcoming dues, net-worth trend — with a credit strip on top |
| **Transactions** | Full ledger with search, category/method/type filters, date ranges, sorting, bulk delete and PDF/Excel/CSV export |
| **Budget** | Per-category monthly limits, used-vs-remaining meters, pace marker, overspend alerts, default plans and auto-suggested limits |
| **Savings** | Goals with progress, contribution history, deadlines and a featured emergency-fund tracker |
| **Investments** | TFSA, RRSP, FHSA, non-registered, GICs, crypto — invested vs current value, allocation, and a calendar of recurring contributions |
| **Loans** | Payment amounts, due dates, remaining term, outstanding balances and full amortisation schedules |
| **Credit cards** | Cards and lines of credit: statements, due dates, minimum due, utilization, APR, opened date and a bill calendar |
| **Net worth** | Assets (with the institution that holds them) minus liabilities over time, with composition and manual entry |
| **Planning** | Paycheque allocation, cash-flow forecast and a financial-independence tracker with what-if scenarios |
| **Reports** | Monthly and yearly analysis with PDF and Excel export, including a Credit sheet |
| **Settings** | Profile, score goal, theme, alert thresholds, planning assumptions and data management |

Reminders — a statement closing while a card is over 30%, a loan payment or card
bill coming due, a budget about to break, a score reading going stale, an inquiry
about to stop counting — are derived from state rather than stored, so they can
never go stale after you pay something.

## How it is put together

```
src/
  types/          the domain model — everything is JSON-round-trippable
  lib/
    credit.ts     everything credit: bands, utilization, factors, recommendations
    finance.ts    everything money: amortisation, budgets, FI maths, forecasts
    storage.ts    FinanceRepository + the local-storage implementation
    seed.ts       the deterministic demo workspace
    palette.ts    the validated chart palette
    export.ts     PDF and Excel generation (lazily loaded)
    brand.ts      the product name, in one place
    date.ts       format.ts   cn.ts   id.ts
  store/          reducer + context; theme provider
  hooks/          hash router, media queries, dismiss handling
  components/
    ui/           Card, Button, Field, Modal, Badge, Progress, StatTile, Table, ErrorBoundary…
    charts/       ChartFrame, TrendChart, ColumnChart, DonutChart, CategoryBars
    layout/       AppShell, Sidebar, NotificationCenter, GlobalSearch
    forms/        the shared transaction form
  pages/          one file per route; Credit.tsx is the landing page
```

**`lib/credit.ts` and `lib/finance.ts` are the only places logic lives.** Both
take state in and return numbers and plain-English reasons out — no React, no
storage — so the same functions serve the UI, the exporters and any future
server.

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
(`#12151c`) chart surfaces. Colour is assigned per *entity* (Rent is always the
same hue, Equifax is always the same hue) and never per rank, so filtering never
repaints the survivors. Three light-mode hues sit below 3:1 contrast on white, so
every chart also ships direct labels, a legend and a **table view** toggle — that
table is the accessibility relief for those hues, and it is what screen-reader
and print users read. No chart in the app uses two y-axes.

Status colours (good / warning / serious / critical) are reserved for state and
always render with an icon and a text label, never colour alone. Score bands are
a rating, not an alarm: "Good" gets the neutral mark, not a warning triangle.

**Currency.** Figures are Canadian dollars via `en-CA`, with compact forms on the
thousand/million scale ($4.9K, $1.2M).

## Known limitations

- Credit scores are entered by hand; nothing connects to a bureau. The
  recommendations work off the accounts you enter, not the score itself.
- Utilization uses the statement balance you record on each card. Keep it
  current before the statement date for the pay-down figures to be exact.
- Payment history is derived: a card counts as late once its due date passes
  unpaid, a loan once a scheduled instalment has not been recorded. The app
  cannot see a late mark that a lender reported before you started tracking.
- Net-worth history before today back-projects bank balances from each month's
  realised cash flow. Investment and loan balances use their real histories.
- Savings-goal contributions are transfers, not expenses, so they are tracked on
  the goal rather than in the transaction ledger.
- `xlsx` is pinned at 0.18.5, the last npm release. Its known advisory affects the
  *parsing* path; this app only ever writes workbooks.
- Local storage is per-browser and per-origin. Clearing site data erases
  everything — use Settings → Export before you do.

CreditCompass offers general information about how credit scoring works. It is
not financial advice.
