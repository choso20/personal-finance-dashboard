import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { classifyGaps, detectForGroup, detectSubscriptions, eligibleForDetection, mergeWithDecisions, subscriptionTotals } from './recurring';

function tx(date: string, amount: number, merchant = 'Netflix'): Transaction {
  return {
    id: `${merchant}-${date}-${amount}`,
    hash: 'h',
    date,
    description: merchant.toUpperCase(),
    normalizedDescription: merchant.toLowerCase(),
    merchant,
    amount,
    account: 'A',
    categoryId: 'cat_subscriptions',
    isManual: false,
    notes: '',
    excluded: false,
    importedAt: 0,
    importBatchId: 'b',
  };
}

describe('classifyGaps', () => {
  it('recognizes regular intervals with drift', () => {
    expect(classifyGaps([30, 31, 28, 33])?.spec.frequency).toBe('monthly');
    expect(classifyGaps([7, 7, 8, 6])?.spec.frequency).toBe('weekly');
    expect(classifyGaps([90, 92, 89])?.spec.frequency).toBe('quarterly');
    expect(classifyGaps([365, 366])?.spec.frequency).toBe('annual');
  });
  it('tolerates a single skipped interval', () => {
    const r = classifyGaps([30, 31, 61, 30]);
    expect(r?.spec.frequency).toBe('monthly');
    expect(r?.skipped).toBe(1);
  });
  it('rejects irregular gaps', () => {
    expect(classifyGaps([3, 40, 12, 70])).toBeNull();
  });
});

describe('detectForGroup', () => {
  it('detects a monthly subscription with date drift', () => {
    const charges = [tx('2024-01-05', -999), tx('2024-02-06', -999), tx('2024-03-04', -999), tx('2024-04-05', -999)];
    const d = detectForGroup('netflix', charges, '2024-04-20')!;
    expect(d).not.toBeNull();
    expect(d.frequency).toBe('monthly');
    expect(d.typicalAmount).toBe(999);
    expect(d.lastDate).toBe('2024-04-05');
    expect(d.nextExpectedDate).toBe('2024-05-05');
    expect(d.annualizedCost).toBe(999 * 12);
    expect(d.monthlyCost).toBe(999);
    expect(d.missed).toBe(false);
    expect(d.priceIncrease).toBeUndefined();
    expect(d.occurrences).toBe(4);
  });

  it('flags a price increase and uses the new price as typical', () => {
    const charges = [tx('2024-01-05', -999), tx('2024-02-05', -999), tx('2024-03-05', -999), tx('2024-04-05', -1299), tx('2024-05-05', -1299)];
    const d = detectForGroup('netflix', charges, '2024-05-20')!;
    expect(d.typicalAmount).toBe(1299);
    expect(d.priceIncrease).toEqual({ from: 999, to: 1299, date: '2024-04-05' });
    expect(d.annualizedCost).toBe(1299 * 12);
  });

  it('tolerates small amount changes (±10%)', () => {
    const charges = [tx('2024-01-05', -1000), tx('2024-02-05', -1050), tx('2024-03-05', -980), tx('2024-04-05', -1020)];
    const d = detectForGroup('x', charges, '2024-04-20')!;
    expect(d.frequency).toBe('monthly');
    expect(d.priceIncrease).toBeUndefined();
  });

  it('rejects wildly varying amounts (e.g. grocery shopping)', () => {
    const charges = [tx('2024-01-05', -1000), tx('2024-02-05', -5000), tx('2024-03-05', -2000), tx('2024-04-05', -7000)];
    expect(detectForGroup('x', charges, '2024-04-20')).toBeNull();
  });

  it('flags a missed charge', () => {
    const charges = [tx('2024-01-05', -999), tx('2024-02-05', -999), tx('2024-03-05', -999)];
    expect(detectForGroup('x', charges, '2024-04-10')!.missed).toBe(false); // within grace
    expect(detectForGroup('x', charges, '2024-04-20')!.missed).toBe(true);
  });

  it('detects weekly, quarterly and annual patterns', () => {
    const weekly = [tx('2024-01-01', -500), tx('2024-01-08', -500), tx('2024-01-15', -500), tx('2024-01-23', -500)];
    expect(detectForGroup('w', weekly, '2024-01-25')!.frequency).toBe('weekly');
    const quarterly = [tx('2023-01-10', -3000), tx('2023-04-11', -3000), tx('2023-07-10', -3000)];
    expect(detectForGroup('q', quarterly, '2023-08-01')!.frequency).toBe('quarterly');
    const annual = [tx('2022-06-01', -9900), tx('2023-06-02', -9900)];
    const a = detectForGroup('a', annual, '2023-08-01')!;
    expect(a.frequency).toBe('annual');
    expect(a.nextExpectedDate).toBe('2024-06-02');
    expect(a.monthlyCost).toBe(825);
  });

  it('needs enough occurrences', () => {
    expect(detectForGroup('x', [tx('2024-01-05', -999), tx('2024-02-05', -999)], '2024-02-20')).toBeNull();
    expect(detectForGroup('x', [tx('2024-01-05', -999)], '2024-02-20')).toBeNull();
  });

  it('survives a skipped month (irregular interval)', () => {
    const charges = [tx('2024-01-05', -999), tx('2024-02-05', -999), tx('2024-04-05', -999), tx('2024-05-05', -999)];
    const d = detectForGroup('x', charges, '2024-05-20')!;
    expect(d).not.toBeNull();
    expect(d.frequency).toBe('monthly');
  });

  it('ignores credits and same-day duplicates', () => {
    const charges = [tx('2024-01-05', -999), tx('2024-01-05', -999), tx('2024-02-05', -999), tx('2024-02-10', 999), tx('2024-03-05', -999)];
    const d = detectForGroup('x', charges, '2024-03-20')!;
    expect(d.occurrences).toBe(3);
  });
});

describe('eligibleForDetection', () => {
  it('drops credits, excluded rows, transfers and income', () => {
    const kinds: Record<string, 'expense' | 'income' | 'transfer'> = { cat_subscriptions: 'expense', cat_transfers: 'transfer', cat_income: 'income' };
    const rows = [
      tx('2024-01-01', -999),
      tx('2024-01-02', 999),
      { ...tx('2024-01-03', -999), excluded: true },
      { ...tx('2024-01-04', -30000), categoryId: 'cat_transfers' },
      { ...tx('2024-01-05', -100), categoryId: 'cat_income' },
      { ...tx('2024-01-06', -100), categoryId: 'cat_unknown' },
    ];
    const out = eligibleForDetection(rows, (id) => kinds[id]);
    expect(out.map((t) => t.date)).toEqual(['2024-01-01', '2024-01-06']);
  });
});

describe('detectSubscriptions + decisions', () => {
  const txs = [
    tx('2024-01-05', -999),
    tx('2024-02-05', -999),
    tx('2024-03-05', -999),
    tx('2024-01-12', -1499, 'Spotify'),
    tx('2024-02-12', -1499, 'Spotify'),
    tx('2024-03-12', -1499, 'Spotify'),
    tx('2024-01-02', -4312, 'Tesco'),
    tx('2024-01-09', -1200, 'Tesco'),
    tx('2024-01-20', -8800, 'Tesco'),
  ];
  it('groups by merchant and sorts by annual cost', () => {
    const d = detectSubscriptions(txs, '2024-03-20');
    expect(d.map((x) => x.merchant)).toEqual(['Spotify', 'Netflix']);
  });
  it('merges decisions and manual entries', () => {
    const d = detectSubscriptions(txs, '2024-03-20');
    const views = mergeWithDecisions(
      d,
      [
        { key: 'spotify', status: 'dismissed', updatedAt: 0 },
        { key: 'netflix', status: 'confirmed', updatedAt: 0 },
        { key: 'gym', status: 'confirmed', updatedAt: 0, manual: { merchant: 'Gym', amount: 2500, frequency: 'monthly', nextDate: '2024-04-01' } },
      ],
      '2024-03-20',
    );
    expect(views.find((v) => v.key === 'spotify')?.status).toBe('dismissed');
    expect(views.find((v) => v.key === 'netflix')?.status).toBe('confirmed');
    const gym = views.find((v) => v.key === 'gym')!;
    expect(gym.source).toBe('manual');
    expect(gym.annualizedCost).toBe(30000);
    const totals = subscriptionTotals(views);
    expect(totals.count).toBe(2);
    expect(totals.monthly).toBe(999 + 2500);
    expect(totals.annual).toBe(999 * 12 + 30000);
  });
});
