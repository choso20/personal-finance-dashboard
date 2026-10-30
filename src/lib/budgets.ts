import type { Budget, Category, ISODate, Minor, Transaction } from '../types';
import { daysBetween, monthKeyFor, monthKeysBetween, monthRange, shiftMonthKey, todayISO } from './dates';

export type BudgetState = 'ok' | 'near' | 'over';

export interface BudgetStatus {
  budget: Budget;
  categoryId: string;
  month: string;
  /** Base monthly amount */
  monthlyAmount: Minor;
  /** Unused budget carried in from previous months (0 when rollover is off) */
  carriedIn: Minor;
  /** monthlyAmount + carriedIn */
  effectiveBudget: Minor;
  spent: Minor;
  remaining: Minor; // may be negative
  /** 0..n ratio of spent to effective budget (1 = 100%) */
  ratio: number;
  state: BudgetState;
  /** Spend projected to month end based on pace so far (equals spent for past months) */
  projected: Minor;
  daysElapsed: number;
  daysInMonth: number;
}

export const NEAR_LIMIT_RATIO = 0.8;

export function budgetState(spent: Minor, effectiveBudget: Minor): BudgetState {
  if (effectiveBudget <= 0) return spent > 0 ? 'over' : 'ok';
  const ratio = spent / effectiveBudget;
  if (ratio > 1) return 'over';
  if (ratio >= NEAR_LIMIT_RATIO) return 'near';
  return 'ok';
}

/** Spend (positive) per month key for a category. Refunds reduce the month's spend. */
export function spentByMonth(txs: Transaction[], categoryId: string, firstDayOfMonth = 1): Map<string, Minor> {
  const map = new Map<string, Minor>();
  for (const t of txs) {
    if (t.excluded || t.categoryId !== categoryId) continue;
    const k = monthKeyFor(t.date, firstDayOfMonth);
    map.set(k, (map.get(k) ?? 0) - t.amount);
  }
  return map;
}

/**
 * Carried-in rollover for `month`: walk from the earliest month with activity
 * (or the budget's first month) forward, accumulating unused budget. Only
 * positive leftovers roll over; overspend does not create debt.
 */
export function carriedInto(
  month: string,
  monthlyAmount: Minor,
  spent: Map<string, Minor>,
  rollover: boolean,
  earliestMonth: string | null,
): Minor {
  if (!rollover || !earliestMonth || earliestMonth >= month) return 0;
  let carry = 0;
  for (const m of monthKeysBetween(earliestMonth, shiftMonthKey(month, -1))) {
    const s = Math.max(0, spent.get(m) ?? 0);
    carry = Math.max(0, monthlyAmount + carry - s);
  }
  return carry;
}

export interface BudgetComputeOptions {
  today?: ISODate;
  firstDayOfMonth?: number;
}

export function computeBudgetStatus(
  budget: Budget,
  txs: Transaction[],
  month: string,
  opts: BudgetComputeOptions = {},
): BudgetStatus {
  const today = opts.today ?? todayISO();
  const fd = opts.firstDayOfMonth ?? 1;
  const spentMap = spentByMonth(txs, budget.categoryId, fd);
  const months = [...spentMap.keys()].sort();
  const earliest = months.length ? months[0] : null;
  const carriedIn = carriedInto(month, budget.monthlyAmount, spentMap, budget.rollover, earliest);
  const effectiveBudget = budget.monthlyAmount + carriedIn;
  const spent = Math.max(0, spentMap.get(month) ?? 0);
  const range = monthRange(month, fd);
  const daysInMonth = daysBetween(range.start, range.end) + 1;
  let daysElapsed: number;
  if (today < range.start) daysElapsed = 0;
  else if (today > range.end) daysElapsed = daysInMonth;
  else daysElapsed = daysBetween(range.start, today) + 1;
  const projected = daysElapsed >= daysInMonth || daysElapsed === 0 ? spent : Math.round((spent / daysElapsed) * daysInMonth);
  return {
    budget,
    categoryId: budget.categoryId,
    month,
    monthlyAmount: budget.monthlyAmount,
    carriedIn,
    effectiveBudget,
    spent,
    remaining: effectiveBudget - spent,
    ratio: effectiveBudget > 0 ? spent / effectiveBudget : spent > 0 ? Infinity : 0,
    state: budgetState(spent, effectiveBudget),
    projected,
    daysElapsed,
    daysInMonth,
  };
}

export interface BudgetHistoryRow {
  month: string;
  budget: Minor; // effective
  actual: Minor;
  state: BudgetState;
}

/** Actual vs budget for the last `months` months ending at `endMonth` (inclusive) */
export function budgetHistory(
  budget: Budget,
  txs: Transaction[],
  endMonth: string,
  months: number,
  opts: BudgetComputeOptions = {},
): BudgetHistoryRow[] {
  const keys = monthKeysBetween(shiftMonthKey(endMonth, -(months - 1)), endMonth);
  return keys.map((m) => {
    const s = computeBudgetStatus(budget, txs, m, opts);
    return { month: m, budget: s.effectiveBudget, actual: s.spent, state: s.state };
  });
}

/** Totals across all budgets for a month */
export function budgetTotals(statuses: BudgetStatus[]): { budget: Minor; spent: Minor; projected: Minor } {
  return statuses.reduce(
    (acc, s) => ({ budget: acc.budget + s.effectiveBudget, spent: acc.spent + s.spent, projected: acc.projected + s.projected }),
    { budget: 0, spent: 0, projected: 0 },
  );
}

/** Categories that can have a budget (expense-kind) */
export function budgetableCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.kind === 'expense');
}
