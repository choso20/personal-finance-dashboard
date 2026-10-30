import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { categoryBreakdown, categoryMap, flowByMonth, previousPeriod, previousPeriodFor, resolvePeriod, spendingByCategoryByMonth, summarize, topMerchants } from './analytics';
import { DEFAULT_CATEGORIES } from './categories';

const cats = categoryMap(DEFAULT_CATEGORIES);

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: p.id ?? Math.random().toString(),
    hash: 'h',
    date: '2024-03-10',
    description: 'X',
    normalizedDescription: 'x',
    merchant: 'X',
    amount: -1000,
    account: 'A',
    categoryId: 'cat_groceries',
    isManual: false,
    notes: '',
    excluded: false,
    importedAt: 0,
    importBatchId: 'b',
    ...p,
  };
}

describe('resolvePeriod', () => {
  it('this month and last N months', () => {
    expect(resolvePeriod('thisMonth', { today: '2024-03-15' })).toEqual({ start: '2024-03-01', end: '2024-03-31' });
    expect(resolvePeriod('last3', { today: '2024-03-15' })).toEqual({ start: '2024-01-01', end: '2024-03-31' });
    expect(resolvePeriod('last12', { today: '2024-03-15' })).toEqual({ start: '2023-04-01', end: '2024-03-31' });
  });
  it('honors custom first day of month', () => {
    expect(resolvePeriod('thisMonth', { today: '2024-03-15', firstDayOfMonth: 25 })).toEqual({ start: '2024-02-25', end: '2024-03-24' });
  });
  it('custom', () => {
    expect(resolvePeriod('custom', { custom: { start: '2024-01-05', end: '2024-01-20' } })).toEqual({ start: '2024-01-05', end: '2024-01-20' });
  });
  it('month presets compare against the preceding months', () => {
    expect(previousPeriodFor('thisMonth', { start: '2024-03-01', end: '2024-03-31' })).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(previousPeriodFor('last3', { start: '2024-01-01', end: '2024-03-31' })).toEqual({ start: '2023-10-01', end: '2023-12-31' });
    expect(previousPeriodFor('thisMonth', { start: '2024-02-25', end: '2024-03-24' }, 25)).toEqual({ start: '2024-01-25', end: '2024-02-24' });
  });
  it('previous period has the same length', () => {
    expect(previousPeriod({ start: '2024-03-01', end: '2024-03-31' })).toEqual({ start: '2024-01-30', end: '2024-02-29' });
    expect(previousPeriod({ start: '2024-01-05', end: '2024-01-20' })).toEqual({ start: '2023-12-20', end: '2024-01-04' });
  });
});

describe('summarize', () => {
  const txs = [
    tx({ amount: 250000, categoryId: 'cat_income' }),
    tx({ amount: -50000 }),
    tx({ amount: -30000, categoryId: 'cat_dining' }),
    tx({ amount: 2000 }), // refund reduces spending
    tx({ amount: -100000, categoryId: 'cat_transfers' }), // ignored
    tx({ amount: -99999, excluded: true }), // ignored
    tx({ amount: -5000, date: '2024-04-01' }), // outside period
  ];
  it('computes income, spending, net and savings rate', () => {
    const s = summarize(txs, cats, { start: '2024-03-01', end: '2024-03-31' });
    expect(s.income).toBe(250000);
    expect(s.spending).toBe(78000);
    expect(s.net).toBe(172000);
    expect(s.savingsRate).toBeCloseTo(0.688);
    expect(s.transactionCount).toBe(4);
  });
  it('savings rate is null without income', () => {
    expect(summarize([tx({})], cats).savingsRate).toBeNull();
  });
});

describe('monthly aggregations', () => {
  const txs = [
    tx({ date: '2024-01-10', amount: -1000 }),
    tx({ date: '2024-01-20', amount: -2000, categoryId: 'cat_dining' }),
    tx({ date: '2024-02-05', amount: -3000 }),
    tx({ date: '2024-02-06', amount: 500000, categoryId: 'cat_income' }),
  ];
  const p = { start: '2024-01-01', end: '2024-03-31' };
  it('spending by category by month includes empty months', () => {
    const rows = spendingByCategoryByMonth(txs, cats, p);
    expect(rows.map((r) => r.month)).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(rows[0].values).toEqual({ cat_groceries: 1000, cat_dining: 2000 });
    expect(rows[0].total).toBe(3000);
    expect(rows[2].total).toBe(0);
  });
  it('flow by month', () => {
    const rows = flowByMonth(txs, cats, p);
    expect(rows[1]).toEqual({ month: '2024-02', income: 500000, spending: 3000, net: 497000 });
  });
  it('category breakdown sorted with shares', () => {
    const b = categoryBreakdown(txs, cats, p);
    expect(b[0].categoryId).toBe('cat_groceries');
    expect(b[0].amount).toBe(4000);
    expect(b[0].share).toBeCloseTo(4000 / 6000);
    expect(b).toHaveLength(2);
  });
  it('top merchants', () => {
    const t = topMerchants([tx({ merchant: 'A', amount: -100 }), tx({ merchant: 'B', amount: -500 }), tx({ merchant: 'A', amount: -300 })], cats, undefined, 1);
    expect(t).toEqual([{ merchant: 'B', amount: 500, count: 1 }]);
  });
});
