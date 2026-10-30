import type { Category, ISODate, Minor, SubscriptionDecision, SubscriptionFrequency, Transaction } from '../types';
import { addDays, addMonths, daysBetween, todayISO } from './dates';

export interface FrequencySpec {
  frequency: SubscriptionFrequency;
  /** Nominal interval in days */
  days: number;
  /** Accepted gap range (days) for one interval */
  min: number;
  max: number;
  /** Minimum charges needed to call it recurring */
  minOccurrences: number;
  /** Days after the expected date before we call a charge "missed" */
  grace: number;
  perYear: number;
}

export const FREQUENCIES: FrequencySpec[] = [
  { frequency: 'weekly', days: 7, min: 5, max: 9, minOccurrences: 4, grace: 3, perYear: 52 },
  { frequency: 'monthly', days: 30.44, min: 26, max: 35, minOccurrences: 3, grace: 7, perYear: 12 },
  { frequency: 'quarterly', days: 91.3, min: 80, max: 100, minOccurrences: 3, grace: 14, perYear: 4 },
  { frequency: 'annual', days: 365.25, min: 350, max: 380, minOccurrences: 2, grace: 30, perYear: 1 },
];

/** Relative amount tolerance for "same" charge */
export const AMOUNT_TOLERANCE = 0.1;

export interface DetectedSubscription {
  key: string;
  merchant: string;
  frequency: SubscriptionFrequency;
  /** Most recent stable charge amount (positive minor units) */
  typicalAmount: Minor;
  lastDate: ISODate;
  nextExpectedDate: ISODate;
  occurrences: number;
  monthlyCost: Minor;
  annualizedCost: Minor;
  /** Set when the latest charges are higher than the earlier ones */
  priceIncrease?: { from: Minor; to: Minor; date: ISODate };
  /** True when the next expected charge is overdue by more than the grace period */
  missed: boolean;
  transactionIds: string[];
  /** Category of the most recent charge (detected subscriptions only) */
  categoryId?: string;
  source: 'detected' | 'manual';
  /** 0..1 rough confidence from interval regularity */
  confidence: number;
}

export function merchantKey(tx: Pick<Transaction, 'merchant' | 'normalizedDescription'>): string {
  const m = (tx.merchant ?? '').trim().toLowerCase();
  return m !== '' ? m : tx.normalizedDescription;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function withinTolerance(a: number, b: number, tol = AMOUNT_TOLERANCE): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return a === b;
  return Math.abs(a - b) / base <= tol;
}

/**
 * Classify a sorted list of gap lengths (days). A gap may also be a small
 * multiple of the interval (a skipped charge) and still support the pattern.
 * Returns the best frequency with a score, or null.
 */
export function classifyGaps(gaps: number[]): { spec: FrequencySpec; score: number; skipped: number } | null {
  let best: { spec: FrequencySpec; score: number; skipped: number } | null = null;
  for (const spec of FREQUENCIES) {
    let good = 0;
    let skipped = 0;
    for (const g of gaps) {
      if (g >= spec.min && g <= spec.max) good++;
      else if (g >= spec.min * 2 && g <= spec.max * 2) {
        good++;
        skipped++;
      }
    }
    const score = gaps.length ? (good - skipped * 0.5) / gaps.length : 0;
    if (score >= 0.7 && (!best || score > best.score)) best = { spec, score, skipped };
  }
  return best;
}

export function nextDate(last: ISODate, frequency: SubscriptionFrequency): ISODate {
  switch (frequency) {
    case 'weekly':
      return addDays(last, 7);
    case 'monthly':
      return addMonths(last, 1);
    case 'quarterly':
      return addMonths(last, 3);
    case 'annual':
      return addMonths(last, 12);
  }
}

export function perYear(frequency: SubscriptionFrequency): number {
  return FREQUENCIES.find((f) => f.frequency === frequency)!.perYear;
}

export function graceDays(frequency: SubscriptionFrequency): number {
  return FREQUENCIES.find((f) => f.frequency === frequency)!.grace;
}

/**
 * Detect one subscription from a group of charges for the same merchant.
 * `charges` must be money-out transactions (negative amounts).
 */
export function detectForGroup(key: string, charges: Transaction[], today: ISODate): DetectedSubscription | null {
  const sorted = charges
    .filter((t) => t.amount < 0)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (sorted.length < 2) return null;

  // Collapse same-day duplicates (e.g. two line items) by keeping the first
  const deduped: Transaction[] = [];
  for (const t of sorted) if (!deduped.length || deduped[deduped.length - 1].date !== t.date) deduped.push(t);
  if (deduped.length < 2) return null;

  // Amount consistency: each charge must be within tolerance of the previous one,
  // allowing one step change (a price increase/decrease).
  const amounts = deduped.map((t) => -t.amount);
  let steps = 0;
  for (let i = 1; i < amounts.length; i++) {
    if (!withinTolerance(amounts[i], amounts[i - 1])) steps++;
  }
  if (steps > 1) return null;

  const gaps: number[] = [];
  for (let i = 1; i < deduped.length; i++) gaps.push(daysBetween(deduped[i - 1].date, deduped[i].date));
  const cls = classifyGaps(gaps);
  if (!cls) return null;
  if (deduped.length < cls.spec.minOccurrences) return null;

  const frequency = cls.spec.frequency;
  const last = deduped[deduped.length - 1];
  // Typical amount: median of the latest run of charges that agree with the last one
  const recent: number[] = [];
  for (let i = amounts.length - 1; i >= 0; i--) {
    if (withinTolerance(amounts[i], amounts[amounts.length - 1])) recent.push(amounts[i]);
    else break;
  }
  const typicalAmount = Math.round(median(recent));
  let priceIncrease: DetectedSubscription['priceIncrease'];
  if (recent.length < amounts.length) {
    const earlier = amounts.slice(0, amounts.length - recent.length);
    const from = Math.round(median(earlier));
    if (typicalAmount > from) {
      priceIncrease = { from, to: typicalAmount, date: deduped[amounts.length - recent.length].date };
    }
  }
  const next = nextDate(last.date, frequency);
  const missed = daysBetween(next, today) > cls.spec.grace;
  const annualizedCost = typicalAmount * cls.spec.perYear;
  return {
    key,
    merchant: last.merchant || last.description,
    frequency,
    typicalAmount,
    lastDate: last.date,
    nextExpectedDate: next,
    occurrences: deduped.length,
    monthlyCost: Math.round(annualizedCost / 12),
    annualizedCost,
    priceIncrease,
    missed,
    transactionIds: deduped.map((t) => t.id),
    categoryId: last.categoryId,
    source: 'detected',
    confidence: Math.min(1, cls.score * Math.min(1, deduped.length / (cls.spec.minOccurrences + 2))),
  };
}

/**
 * Transactions worth scanning for subscriptions: money out, not excluded from
 * reports, and not in a transfer or income category.
 */
export function eligibleForDetection(txs: Transaction[], categoryKind: (categoryId: string) => Category['kind'] | undefined): Transaction[] {
  return txs.filter((t) => {
    if (t.amount >= 0 || t.excluded) return false;
    const kind = categoryKind(t.categoryId);
    return kind !== 'transfer' && kind !== 'income';
  });
}

/** Group transactions by merchant key and detect subscriptions in each group */
export function detectSubscriptions(txs: Transaction[], today: ISODate = todayISO()): DetectedSubscription[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.amount >= 0) continue;
    const k = merchantKey(t);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const out: DetectedSubscription[] = [];
  for (const [key, group] of groups) {
    const d = detectForGroup(key, group, today);
    if (d) out.push(d);
  }
  return out.sort((a, b) => b.annualizedCost - a.annualizedCost);
}

export interface SubscriptionView extends DetectedSubscription {
  status: 'confirmed' | 'dismissed' | 'suggested';
}

/**
 * Combine detections with the user's remembered decisions:
 * - dismissed keys are hidden (returned with status so the UI can list them separately)
 * - confirmed keys are marked
 * - manual subscriptions are added (using detection data when the merchant is also detected)
 */
export function mergeWithDecisions(
  detected: DetectedSubscription[],
  decisions: SubscriptionDecision[],
  today: ISODate = todayISO(),
): SubscriptionView[] {
  const byKey = new Map(decisions.map((d) => [d.key, d]));
  const out: SubscriptionView[] = [];
  const seen = new Set<string>();
  for (const d of detected) {
    seen.add(d.key);
    const dec = byKey.get(d.key);
    out.push({ ...d, status: dec?.status ?? 'suggested' });
  }
  for (const dec of decisions) {
    if (seen.has(dec.key) || !dec.manual) continue;
    const m = dec.manual;
    const annual = m.amount * perYear(m.frequency);
    const next = m.nextDate ?? nextDate(today, m.frequency);
    out.push({
      key: dec.key,
      merchant: m.merchant,
      frequency: m.frequency,
      typicalAmount: m.amount,
      lastDate: '',
      nextExpectedDate: next,
      occurrences: 0,
      monthlyCost: Math.round(annual / 12),
      annualizedCost: annual,
      missed: daysBetween(next, today) > graceDays(m.frequency),
      transactionIds: [],
      source: 'manual',
      confidence: 1,
      status: dec.status,
    });
  }
  return out;
}

/** Monthly and annual totals of active (not dismissed) subscriptions */
export function subscriptionTotals(views: SubscriptionView[]): { monthly: Minor; annual: Minor; count: number } {
  const active = views.filter((v) => v.status !== 'dismissed' && !v.missed);
  return {
    monthly: active.reduce((s, v) => s + v.monthlyCost, 0),
    annual: active.reduce((s, v) => s + v.annualizedCost, 0),
    count: active.length,
  };
}
