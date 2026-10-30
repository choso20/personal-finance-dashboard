# Personal Finance Dashboard

A private, local-first personal finance app that runs entirely in your browser. Import your bank's CSV exports and get a clear picture of where your money goes, without handing your transactions to anyone. There is no backend, no account and no network traffic carrying financial data: everything is stored in your browser's local database.

## What it does

- **Import bank CSVs** from any bank. A column-mapping step handles different layouts (one signed amount column or separate debit/credit columns, various date formats, currency symbols, thousands separators, parentheses for negatives). Save the mapping as a bank profile so the next import is one click. Re-importing a file never creates duplicates.
- **Auto-categorise** transactions with an editable rules engine. Rules match on description, amount, direction or account, run in priority order, and can rename messy merchant strings to clean names. A starter set covers common supermarkets, streaming services, rideshares and utilities. Create a rule from any transaction, see how many it will match before saving, and categories you set by hand are never overwritten.
- **Browse transactions** in a searchable, sortable, filterable table with inline category edits, notes, bulk re-categorising and the option to exclude items (such as transfers between your own accounts) from reports. Export any filtered view as CSV.
- **See spending trends** on a dashboard: monthly spending by category, income versus expenses, a category breakdown and top merchants for any period, with summary cards showing income, spending, net, savings rate and change versus the previous period. Click any chart segment to drill into the underlying transactions.
- **Set budgets** per category with progress bars, over/near-limit warnings, a projected month-end spend based on your pace so far, optional rollover of unused budget and a history of actual versus budget.
- **Spot subscriptions** automatically. Recurring charges are detected at weekly, monthly, quarterly and annual intervals, with price increases and charges that appear to have stopped flagged. Confirm, dismiss or add subscriptions by hand and see your total monthly and annual subscription cost.
- **Keep control of your data** with full JSON backup and restore, a delete-everything option, light and dark mode, and settings for currency symbol and the first day of your week and month.

## Running it

```bash
npm install
npm run dev
```

Then open the address Vite prints. To use it without a server, run `npm run build` and open `dist/index.html` directly in a browser; it is a single self-contained file.

The `sample-data` folder contains three fake bank exports in different formats, and the Import page has buttons to load them, so you can try every feature straight away.

## Built with

Vite, React, TypeScript, Tailwind CSS, Recharts, Papa Parse, Dexie (IndexedDB) and Vitest.

## Privacy

All data lives in your browser's IndexedDB on your machine. Nothing is uploaded anywhere. Clearing your browser's site data will remove it, so export a backup from the Settings page if you want to keep it.
