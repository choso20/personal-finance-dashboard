import { describe, expect, it } from 'vitest';
import type { Budget, Transaction } from '../types';
import { budgetHistory, budgetState, carriedInto, computeBudgetStatus } from './budgets';

function tx(date: string, amount: number, categoryId = 'cat_groceries', excluded = false): Transaction {
  return {
    id: Math.random().toString(),
    hash: 'h',
    date,
    description: 'X',
    normalizedDescription: 'x',
    merchant: 'X',
    amount,
    account: 'A',
    categoryId,
    isManual: false,
    notes: '',
    excluded,
    importedAt: 0,
    importBatchId: 'b',
  };
}

const budget: Budget = { id: 'b1', categoryId: 'cat_groceries', monthlyAmount: 30000, rollover: false };

describe('budgetState', () => {
  it('thresholds', () => {
    expect(budgetState(0, 30000)).toBe('ok');
    expect(budgetState(23999, 30000)).toBe('ok');
    expect(budgetState(24000, 30000)).toBe('near');
    expect(budgetState(30000, 30000)).toBe('near');
    expect(budgetState(30001, 30000)).toBe('over');
    expect(budgetState(1, 0)).toBe('over');
  });
});

describe('computeBudgetStatus', () => {
  const txs = [
    tx('2024-03-02', -5000),
    tx('2024-03-05', -7000),
    tx('2024-03-05', -9999, 'cat_dining'), // other category
    tx('2024-03-06', -1000, 'cat_groceries', true), // excluded
    tx('2024-03-07', 500), // refund
  ];
  it('sums spend for the month and projects by pace', () => {
    const s = computeBudgetStatus(budget, txs, '2024-03', { today: '2024-03-10' });
    expect(s.spent).toBe(11500);
    expect(s.effectiveBudget).toBe(30000);
    expect(s.remaining).toBe(18500);
    expect(s.state).toBe('ok');
    expect(s.daysElapsed).toBe(10);
    expect(s.daysInMonth).toBe(31);
    expect(s.projected).toBe(Math.round((11500 / 10) * 31));
  });
  it('past months project to actual spend', () => {
    const s = computeBudgetStatus(budget, txs, '2024-03', { today: '2024-05-01' });
    expect(s.projected).toBe(11500);
    expect(s.daysElapsed).toBe(31);
  });
  it('future months have zero spend', () => {
    const s = computeBudgetStatus(budget, txs, '2024-04', { today: '2024-03-10' });
    expect(s.spent).toBe(0);
    expect(s.projected).toBe(0);
  });
  it('honors custom first day of month', () => {
    const s = computeBudgetStatus(budget, [tx('2024-03-24', -1000), tx('2024-03-25', -2000)], '2024-03', { today: '2024-04-01', firstDayOfMonth: 25 });
    expect(s.spent).toBe(2000);
  });
});

describe('rollover', () => {
  const rb: Budget = { ...budget, rollover: true };
  it('carries unused budget forward, never debt', () => {
    const spent = new Map([
      ['2024-01', 20000], // 10000 unused
      ['2024-02', 35000], // over by 5000 => carry becomes max(0, 30000+10000-35000)=5000
    ]);
    expect(carriedInto('2024-02', 30000, spent, true, '2024-01')).toBe(10000);
    expect(carriedInto('2024-03', 30000, spent, true, '2024-01')).toBe(5000);
    expect(carriedInto('2024-03', 30000, spent, false, '2024-01')).toBe(0);
    expect(carriedInto('2024-01', 30000, spent, true, '2024-01')).toBe(0);
  });
  it('empty months still accumulate', () => {
    const spent = new Map([['2024-01', 0]]);
    expect(carriedInto('2024-04', 30000, spent, true, '2024-01')).toBe(90000);
  });
  it('is reflected in the status', () => {
    const txs = [tx('2024-01-10', -20000), tx('2024-02-10', -5000)];
    const s = computeBudgetStatus(rb, txs, '2024-02', { today: '2024-02-20' });
    expect(s.carriedIn).toBe(10000);
    expect(s.effectiveBudget).toBe(40000);
    expect(s.state).toBe('ok');
  });
});

describe('budgetHistory', () => {
  it('returns one row per month', () => {
    const txs = [tx('2024-01-10', -31000), tx('2024-02-10', -25000)];
    const h = budgetHistory(budget, txs, '2024-03', 3, { today: '2024-03-31' });
    expect(h.map((r) => r.month)).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(h[0].state).toBe('over');
    expect(h[1].state).toBe('near');
    expect(h[2].actual).toBe(0);
  });
});
