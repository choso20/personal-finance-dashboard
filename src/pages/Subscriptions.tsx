import { AlertTriangle, Check, Plus, Repeat, TrendingUp, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Card, EmptyState, Field, Modal, PageHeader, Stat } from '../components/ui';
import { deleteDecision, saveDecision } from '../db/repo';
import { useCategoryMap, useDecisions, useMoney, useTransactions } from '../hooks/useData';
import { formatDateLong, todayISO } from '../lib/dates';
import { toMinor } from '../lib/money';
import { detectSubscriptions, eligibleForDetection, mergeWithDecisions, subscriptionTotals, type SubscriptionView } from '../lib/recurring';
import { CategoryBadge } from '../components/CategorySelect';
import type { SubscriptionFrequency } from '../types';

const FREQ_LABEL: Record<SubscriptionFrequency, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };

export function SubscriptionsPage() {
  const txs = useTransactions();
  const decisions = useDecisions();
  const catMap = useCategoryMap();
  const fmt = useMoney();
  const toast = useToast();
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  const views = useMemo(() => {
    if (!txs || !decisions) return [];
    const eligible = eligibleForDetection(txs, (id) => catMap.get(id)?.kind);
    return mergeWithDecisions(detectSubscriptions(eligible, today), decisions, today);
  }, [txs, decisions, today, catMap]);
  const totals = useMemo(() => subscriptionTotals(views), [views]);

  if (!txs || !decisions) return null;

  const active = views.filter((v) => v.status !== 'dismissed');
  const dismissed = views.filter((v) => v.status === 'dismissed');
  const decide = async (v: SubscriptionView, status: 'confirmed' | 'dismissed') => {
    const existing = decisions.find((d) => d.key === v.key);
    await saveDecision({ key: v.key, status, manual: existing?.manual, updatedAt: Date.now() });
  };
  const undo = async (v: SubscriptionView) => {
    if (v.source === 'manual') await deleteDecision(v.key);
    else {
      const existing = decisions.find((d) => d.key === v.key);
      if (existing?.manual) await saveDecision({ ...existing, status: 'confirmed', updatedAt: Date.now() });
      else await deleteDecision(v.key);
    }
  };

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Recurring charges detected from your transactions. Confirm the real ones and dismiss the rest."
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add manually
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Monthly cost" value={fmt(totals.monthly)} sub={`${totals.count} active (confirmed + suggested, excluding missed)`} />
        <Stat label="Annual cost" value={fmt(totals.annual)} />
        <Stat label="Needs attention" value={active.filter((v) => v.missed || v.priceIncrease).length} sub="price increases or missed charges" tone={active.some((v) => v.missed || v.priceIncrease) ? 'bad' : 'neutral'} />
      </div>

      {active.length === 0 ? (
        <EmptyState title="No recurring charges found" icon={<Repeat size={32} />}>
          Subscriptions are detected once a merchant has been charged a similar amount at regular intervals (at least 3 months of history for monthly charges).
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="th">Merchant</th>
                <th className="th text-right">Amount</th>
                <th className="th">Frequency</th>
                <th className="th">Last charge</th>
                <th className="th">Next expected</th>
                <th className="th text-right">Per year</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {active.map((v) => (
                <tr key={v.key} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="td">
                    <Link to={`/transactions?merchant=${encodeURIComponent(v.merchant)}`} className="font-medium hover:underline">
                      {v.merchant}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {v.categoryId && <CategoryBadge category={catMap.get(v.categoryId)} />}
                      <span>{v.source === 'manual' ? 'added manually' : `${v.occurrences} charges`}</span>
                    </div>
                  </td>
                  <td className="td text-right tabular-nums">
                    {fmt(v.typicalAmount)}
                    {v.priceIncrease && (
                      <div className="flex items-center justify-end gap-1 text-xs text-red-600 dark:text-red-400" title={`Increased on ${v.priceIncrease.date}`}>
                        <TrendingUp size={12} /> was {fmt(v.priceIncrease.from)}
                      </div>
                    )}
                  </td>
                  <td className="td">{FREQ_LABEL[v.frequency]}</td>
                  <td className="td whitespace-nowrap">{v.lastDate ? formatDateLong(v.lastDate) : '—'}</td>
                  <td className={`td whitespace-nowrap ${v.missed ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {formatDateLong(v.nextExpectedDate)}
                    {v.missed && (
                      <div className="flex items-center gap-1 text-xs">
                        <AlertTriangle size={12} /> missed — may have stopped
                      </div>
                    )}
                  </td>
                  <td className="td text-right tabular-nums">{fmt(v.annualizedCost)}</td>
                  <td className="td">
                    {v.status === 'confirmed' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <Check size={12} /> Confirmed
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Suggested</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-right">
                    {v.status !== 'confirmed' && (
                      <button className="btn-secondary btn-sm" onClick={() => decide(v, 'confirmed')} title="Confirm">
                        <Check size={14} /> Confirm
                      </button>
                    )}
                    <button className="btn-ghost btn-sm ml-1" onClick={() => decide(v, 'dismissed')} title="Not a subscription">
                      <X size={14} /> Not a subscription
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dismissed.length > 0 && (
        <div className="mt-6">
          <button className="btn-ghost btn-sm" onClick={() => setShowDismissed((s) => !s)}>
            {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
          </button>
          {showDismissed && (
            <Card className="mt-2">
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {dismissed.map((v) => (
                  <li key={v.key} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {v.merchant} · {fmt(v.typicalAmount)} {FREQ_LABEL[v.frequency].toLowerCase()}
                    </span>
                    <button className="btn-ghost btn-sm" onClick={() => undo(v)}>
                      <Undo2 size={14} /> Undo
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <AddManualModal
        open={adding}
        onClose={() => setAdding(false)}
        onSave={async (d) => {
          await saveDecision({ key: `manual:${d.merchant.trim().toLowerCase()}`, status: 'confirmed', manual: d, updatedAt: Date.now() });
          setAdding(false);
          toast('Subscription added', 'success');
        }}
      />
    </div>
  );
}

function AddManualModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (d: { merchant: string; amount: number; frequency: SubscriptionFrequency; nextDate?: string }) => void }) {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('monthly');
  const [nextDate, setNextDate] = useState('');
  const valid = merchant.trim() && parseFloat(amount) > 0;
  return (
    <Modal open={open} onClose={onClose} title="Add subscription">
      <div className="grid gap-3">
        <Field label="Merchant">
          <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Gym" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Frequency">
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}>
              {(Object.keys(FREQ_LABEL) as SubscriptionFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Next charge date (optional)">
          <input type="date" className="input" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!valid}
            onClick={() => {
              onSave({ merchant: merchant.trim(), amount: toMinor(parseFloat(amount)), frequency, nextDate: nextDate || undefined });
              setMerchant('');
              setAmount('');
              setNextDate('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}
