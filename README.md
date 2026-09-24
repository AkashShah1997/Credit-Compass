# CreditCompass

A credit-score tool for Canada. It answers one question: **what is my score doing, why, and what do I do next?**

It asks for about a dozen numbers, once. Then one number a month.

Everything runs in your browser. No account, no server, no analytics, no network call with your data — ever. Your workspace lives in this browser's local storage, and a downloadable file is how you back it up or move it.

## Contents

- [What you actually have to enter](#what-you-actually-have-to-enter)
- [Running it](#running-it)
- [Deploying](#deploying)
- [Your data file](#your-data-file)
- [What the credit page shows](#what-the-credit-page-shows)
- [The rules behind the advice](#the-rules-behind-the-advice)
- [How it is put together](#how-it-is-put-together)
- [Design notes](#design-notes)
- [Known limitations](#known-limitations)

## What you actually have to enter

| | Fields |
|---|---|
| Each credit card | **4** — name, limit, balance, the day your statement closes |
| Each loan | **3** — name, monthly payment, when it started |
| Your score | **1** — the number Borrowell / Credit Karma / your bank app already shows you free |
| A hard inquiry | **2** — lender and date |

That is the whole model. If knowing something would not change the advice, the app does not ask for it — which is why there is no principal, no interest rate, no amortization schedule, no transaction ledger, and no budget.

**Monthly upkeep:** your score, and your card balance. Two numbers, two buttons on the home page.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm run preview  # serve the production build — always check this before deploying
npm run lint
```

First run opens a three-step setup wizard. Every step is skippable, and the app works with whatever you give it.

## Deploying

A static site. Push to GitHub, import in Vercel:

- Framework preset **Vite** (auto-detected), build `npm run build`, output `dist`, no environment variables.
- Routing is hash-based (`/#/accounts`), so there is nothing to rewrite — every URL is served by `index.html`.
- [`vercel.json`](vercel.json) adds privacy and hardening headers only.
- Node 22 is pinned via `engines`.

Local storage is per-origin, so a preview deployment has its own empty workspace and cannot see production data. Move between them with a backup file.

## Your data file

Settings → **Your data file**:

- **Download my data** writes `CreditCompass-backup-YYYY-MM-DD.json` straight to your disk. Plain, readable JSON — open it in any text editor.
- **Load a file back** reads one you saved before, shows you what is in it, and asks before replacing anything.

Both directions are entirely local. The file never touches a network. This is also how you move your workspace between devices or browsers, and your insurance against clearing site data.

## What the credit page shows

| Panel | What it does |
|---|---|
| **Score** | Latest reading, its Equifax band, progress to your goal, change since last reading and since your peak |
| **Why your score dropped** | Names the account that most likely caused it, the normal 40–80 point range, and the month-12-to-18 recovery window — only shown when there is actually something to explain |
| **What to do next** | An ordered list built from *your* balances and dates: "Pay $2,481 on CIBC Visa before the 25th — reported utilization 61% → under 30%". Each carries an impact rating and a timing |
| **What if I pay some off?** | A slider: drag a payment amount, see exactly what would be reported on your statement date, with the 10% and 30% lines marked |
| **Score history** | One line per bureau (never compared to each other), your goal as a reference, vertical markers where a loan started or a lender pulled your file |
| **Five factors** | Payment history, utilization, length of history, credit mix, new credit — weighted the way the bureaus describe them, each with the reason for its status |
| **Timeline** | Every reading, inquiry and account opening in date order |
| **Ask an AI** | Builds an anonymous plain-text briefing from your numbers to paste into ChatGPT, Claude, Gemini or anything else — including the app's own suggestions, so you can ask the assistant to disagree with them |

### The rules behind the advice

Every rule in [`src/lib/credit.ts`](src/lib/credit.ts) is guarded by the data that triggers it, so a healthy file gets one line, not a lecture. In priority order:

1. A missed payment in the last two years — autopay everything, it is ~35% of the score
2. Any account at or above 30% utilization — with the dollars to pay **before the statement date**, which is the balance bureaus actually see
3. The interest cost of carrying a balance, when you have entered the APR
4. A single card — ask for a limit increase (often a soft check) rather than opening an account while an inquiry is fresh
5. A new account — the expected dip and the 12–18 month recovery window
6. Hard inquiries still counting — apply for nothing until the date it clears
7. A thin file (under 4 years) — protect the oldest account, it only heals with time
8. A stale score reading

Scores are entered by hand because no Canadian bureau offers a consumer API. Everything else the app works out from your accounts, so the advice is complete even if you never log a score.

## How it is put together

```
src/
  types/index.ts        the model — small enough to read in one sitting
  lib/
    credit.ts           the engine: bands, utilization, factors, recommendations, simulator
    backup.ts           download / restore the JSON file
    prompt.ts           the AI briefing
    storage.ts          local-storage repository + migrate()
    seed.ts             the example workspace (loaded only on request)
    date.ts format.ts palette.ts brand.ts cn.ts id.ts
  store/                reducer + context; theme provider
  components/
    ui/ charts/ layout/ setup/
  pages/
    Home.tsx            credit health — the landing page
    Accounts.tsx        cards, loans, inquiries
    Settings.tsx        goal, data file, appearance
```

**`lib/credit.ts` is the only place credit logic lives.** State in, numbers and plain-English reasons out — no React, no storage — so the same functions serve the UI, the AI briefing and anything added later.

Feature code never touches `localStorage`; it goes through a `Repository` interface with async `load`/`save`. Swapping in a different backend means writing one class. Stored payloads pass through `migrate()` on read, so an older or hand-edited backup still opens.

## Design notes

**Theming.** Every colour is a CSS custom property declared once per theme and exposed to Tailwind through `@theme inline`, which is what lets the palette swap when `data-theme` changes. An inline script in `index.html` applies the stored theme before first paint, so there is no flash of the wrong mode.

**Charts.** The categorical colours are a validated set passing lightness-band, chroma-floor and colour-blind separation checks against both the light and dark chart surfaces. Colour follows the entity — Equifax is always the same hue — never the rank. Every chart ships a legend and a **table view** toggle, which is what screen-reader and print users read.

Status colours are reserved for state and always render with an icon and a word, never colour alone. Score bands are a rating, not an alarm: "Good" gets the neutral mark.

## Known limitations

- Scores are entered by hand; nothing connects to a bureau.
- Utilization uses the balance you record on each card, so keep it current before the statement date for the pay-down figures to be exact.
- Payment history is one question rather than a derived ledger — the app cannot see a late mark a lender reported before you started tracking.
- Local storage is per-browser and per-origin. Clearing site data erases everything; download your file first.

CreditCompass offers general information about how credit scoring works. It is not financial advice.
