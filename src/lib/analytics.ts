import type { Category, ISODate, Minor, Transaction } from '../types';
import { addDays, addMonths, daysBetween, monthKeyFor, monthKeysBetween, monthRange, todayISO } from './dates';

export interface Period {
  start: ISODate;
  end: ISODate; // inclusive
}

export type PeriodPreset = 'thisMonth' | 'last3' | 'last6' | 'last12' | 'custom';

/** Resolve a preset into a concrete date range */
export function resolvePeriod(
  preset: PeriodPreset,
  opts: { today?: ISODate; firstDayOfMonth?: number; custom?: Period } = {},
): Period {
  const today = opts.today ?? todayISO();
  const fd = opts.firstDayOfMonth ?? 1;
  const currentKey = monthKeyFor(today, fd);
  const current = monthRange(currentKey, fd);
  switch (preset) {
    case 'thisMonth':
      return current;
    case 'last3':
      return { start: monthRange(shift(currentKey, -2), fd).start, end: current.end };
    case 'last6':
      return { start: monthRange(shift(currentKey, -5), fd).start, end: current.end };
    case 'last12':
      return { start: monthRange(shift(currentKey, -11), fd).start, end: current.end };
    case 'custom':
      return opts.custom ?? current;
  }
}

function shift(monthKey: string, n: number): string {
  return addMonths(`${monthKey}-01`, n).slice(0, 7);
}

/** The period of the same length immediately before `p` */
export function previousPeriod(p: Period): Period {
  const len = daysBetween(p.start, p.end) + 1;
  const end = addDays(p.start, -1);
  return { start: addDays(end, -(len - 1)), end };
}

/**
 * Previous period for comparison: month presets step back by whole months
 * (so "this month" compares with last month); custom ranges use equal length.
 */
export function previousPeriodFor(preset: PeriodPreset, p: Period, firstDayOfMonth = 1): Period {
  const months = preset === 'thisMonth' ? 1 : preset === 'last3' ? 3 : preset === 'last6' ? 6 : preset === 'last12' ? 12 : 0;
  if (months === 0) return previousPeriod(p);
  const startKey = monthKeyFor(p.start, firstDayOfMonth);
  const endKey = monthKeyFor(p.end, firstDayOfMonth);
  return {
    start: monthRange(shift(startKey, -months), firstDayOfMonth).start,
    end: monthRange(shift(endKey, -months), firstDayOfMonth).end,
  };
}

export function inPeriod(date: ISODate, p: Period): boolean {
  return date >= p.start && date <= p.end;
}

/** Transactions that count toward reports: not excluded, within the period */
export function reportable(txs: Transaction[], p?: Period): Transaction[] {
  return txs.filter((t) => !t.excluded && (!p || inPeriod(t.date, p)));
}

export type CategoryMap = Map<string, Category>;

export function categoryMap(categories: Category[]): CategoryMap {
  return new Map(categories.map((c) => [c.id, c]));
}

function kindOf(tx: Transaction, cats: CategoryMap): Category['kind'] {
  return cats.get(tx.categoryId)?.kind ?? 'expense';
}

export interface Summary {
  income: Minor;
  spending: Minor; // positive number
  net: Minor;
  /** 0..1, null when there is no income */
  savingsRate: number | null;
  transactionCount: number;
}

/**
 * Income = sum of amounts in income-kind categories.
 * Spending = -(sum of amounts in expense-kind categories), so refunds reduce spending.
 * Transfers are ignored. Excluded transactions are ignored.
 */
export function summarize(txs: Transaction[], cats: CategoryMap, p?: Period): Summary {
  let income = 0;
  let expenseNet = 0;
  let count = 0;
  for (const t of reportable(txs, p)) {
    const kind = kindOf(t, cats);
    if (kind === 'transfer') continue;
    count++;
    if (kind === 'income') income += t.amount;
    else expenseNet += t.amount;
  }
  const spending = Math.max(0, -expenseNet);
  const net = income - spending;
  return {
    income,
    spending,
    net,
    savingsRate: income > 0 ? net / income : null,
    transactionCount: count,
  };
}

export interface MonthlyCategoryRow {
  month: string; // YYYY-MM
  /** categoryId => spend (positive) */
  values: Record<string, Minor>;
  total: Minor;
}

/** Spending per category per month across the period (expense-kind categories only) */
export function spendingByCategoryByMonth(
  txs: Transaction[],
  cats: CategoryMap,
  p: Period,
  firstDayOfMonth = 1,
): MonthlyCategoryRow[] {
  const months = monthKeysBetween(monthKeyFor(p.start, firstDayOfMonth), monthKeyFor(p.end, firstDayOfMonth));
  const rows = new Map<string, MonthlyCategoryRow>(months.map((m) => [m, { month: m, values: {}, total: 0 }]));
  for (const t of reportable(txs, p)) {
    if (kindOf(t, cats) !== 'expense') continue;
    const row = rows.get(monthKeyFor(t.date, firstDayOfMonth));
    if (!row) continue;
    const spend = -t.amount;
    row.values[t.categoryId] = (row.values[t.categoryId] ?? 0) + spend;
    row.total += spend;
  }
  return months.map((m) => rows.get(m)!);
}

export interface MonthlyFlowRow {
  month: string;
  income: Minor;
  spending: Minor;
  net: Minor;
}

/** Income vs spending vs net per month */
export function flowByMonth(txs: Transaction[], cats: CategoryMap, p: Period, firstDayOfMonth = 1): MonthlyFlowRow[] {
  const months = monthKeysBetween(monthKeyFor(p.start, firstDayOfMonth), monthKeyFor(p.end, firstDayOfMonth));
  const rows = new Map<string, MonthlyFlowRow>(months.map((m) => [m, { month: m, income: 0, spending: 0, net: 0 }]));
  for (const t of reportable(txs, p)) {
    const kind = kindOf(t, cats);
    if (kind === 'transfer') continue;
    const row = rows.get(monthKeyFor(t.date, firstDayOfMonth));
    if (!row) continue;
    if (kind === 'income') row.income += t.amount;
    else row.spending -= t.amount;
  }
  return months.map((m) => {
    const r = rows.get(m)!;
    r.spending = Math.max(0, r.spending);
    r.net = r.income - r.spending;
    return r;
  });
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string;
  amount: Minor;
  share: number; // 0..1
}

/** Spending by category for the period (expense-kind only), largest first */
export function categoryBreakdown(txs: Transaction[], cats: CategoryMap, p?: Period): CategorySlice[] {
  const totals = new Map<string, Minor>();
  for (const t of reportable(txs, p)) {
    if (kindOf(t, cats) !== 'expense') continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) - t.amount);
  }
  const slices = [...totals.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, amount]) => {
      const c = cats.get(id);
      return { categoryId: id, name: c?.name ?? 'Unknown', color: c?.color ?? '#94a3b8', amount, share: 0 };
    })
    .sort((a, b) => b.amount - a.amount);
  const total = slices.reduce((s, x) => s + x.amount, 0);
  for (const s of slices) s.share = total > 0 ? s.amount / total : 0;
  return slices;
}

export interface MerchantRow {
  merchant: string;
  amount: Minor;
  count: number;
}

/** Top merchants by spend in the period (expense-kind only) */
export function topMerchants(txs: Transaction[], cats: CategoryMap, p: Period | undefined, limit = 10): MerchantRow[] {
  const map = new Map<string, MerchantRow>();
  for (const t of reportable(txs, p)) {
    if (kindOf(t, cats) !== 'expense' || t.amount >= 0) continue;
    const key = t.merchant || t.description;
    const row = map.get(key) ?? { merchant: key, amount: 0, count: 0 };
    row.amount -= t.amount;
    row.count++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/** Distinct account names, sorted */
export function accountNames(txs: Transaction[]): string[] {
  return [...new Set(txs.map((t) => t.account))].sort();
}
