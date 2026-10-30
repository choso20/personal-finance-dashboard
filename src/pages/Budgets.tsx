import { ChevronLeft, ChevronRight, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryBadge } from '../components/CategorySelect';
import { useToast } from '../components/Toast';
import { Card, EmptyState, Field, Modal, PageHeader, Stat, Toggle } from '../components/ui';
import { deleteBudget, saveBudget } from '../db/repo';
import { useBudgets, useCategories, useCategoryMap, useMoney, useSettings, useTransactions } from '../hooks/useData';
import { budgetHistory, budgetTotals, budgetableCategories, computeBudgetStatus, type BudgetState, type BudgetStatus } from '../lib/budgets';
import { monthKeyFor, monthKeysBetween, monthLabel, monthShortLabel, shiftMonthKey, todayISO } from '../lib/dates';
import { newId } from '../lib/ids';
import { toMajor, toMinor } from '../lib/money';
import type { Budget } from '../types';

const STATE_COLORS: Record<BudgetState, string> = { ok: 'bg-emerald-500', near: 'bg-amber-500', over: 'bg-red-500' };
const STATE_TEXT: Record<BudgetState, string> = { ok: 'text-emerald-600 dark:text-emerald-400', near: 'text-amber-600 dark:text-amber-400', over: 'text-red-600 dark:text-red-400' };

export function BudgetsPage() {
  const budgets = useBudgets();
  const txs = useTransactions() ?? [];
  const categories = useCategories() ?? [];
  const catMap = useCategoryMap();
  const settings = useSettings();
  const fmt = useMoney();
  const toast = useToast();
  const today = todayISO();
  const currentMonth = monthKeyFor(today, settings.firstDayOfMonth);
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [view, setView] = useState<'month' | 'history'>('month');

  const opts = useMemo(() => ({ today, firstDayOfMonth: settings.firstDayOfMonth }), [today, settings.firstDayOfMonth]);
  const statuses: BudgetStatus[] = useMemo(
    () => (budgets ?? []).map((b) => computeBudgetStatus(b, txs, month, opts)).sort((a, b) => b.ratio - a.ratio),
    [budgets, txs, month, opts],
  );
  const totals = useMemo(() => budgetTotals(statuses), [statuses]);
  const unbudgeted = useMemo(() => budgetableCategories(categories).filter((c) => !(budgets ?? []).some((b) => b.categoryId === c.id)), [categories, budgets]);

  if (!budgets) return null;

  const isCurrent = month === currentMonth;

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="Monthly limits per category, with projections based on your pace so far."
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
              <button className={`px-3 py-1.5 text-sm ${view === 'month' ? 'bg-indigo-600 text-white' : ''}`} onClick={() => setView('month')}>
                Month
              </button>
              <button className={`px-3 py-1.5 text-sm ${view === 'history' ? 'bg-indigo-600 text-white' : ''}`} onClick={() => setView('history')}>
                History
              </button>
            </div>
            <button className="btn-primary" onClick={() => setEditing({ id: newId('budget'), categoryId: unbudgeted[0]?.id ?? '', monthlyAmount: 0, rollover: false })} disabled={unbudgeted.length === 0}>
              <Plus size={16} /> Add budget
            </button>
          </>
        }
      />

      {view === 'month' ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[8rem] text-center font-medium">{monthLabel(month)}</span>
            <button className="btn-secondary btn-sm" onClick={() => setMonth(shiftMonthKey(month, 1))} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
            {!isCurrent && (
              <button className="btn-ghost btn-sm" onClick={() => setMonth(currentMonth)}>
                Today
              </button>
            )}
          </div>

          {budgets.length === 0 ? (
            <EmptyState title="No budgets yet" icon={<PiggyBank size={32} />}>
              Add a monthly budget for a category to track progress and see a projected month-end spend.
            </EmptyState>
          ) : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Stat label="Total budget" value={fmt(totals.budget)} />
                <Stat label="Spent so far" value={fmt(totals.spent)} sub={`${totals.budget > 0 ? Math.round((totals.spent / totals.budget) * 100) : 0}% of budget`} tone={totals.spent > totals.budget ? 'bad' : 'neutral'} />
                <Stat label={isCurrent ? 'Projected month end' : 'Actual'} value={fmt(totals.projected)} tone={totals.projected > totals.budget ? 'bad' : 'good'} sub={isCurrent ? `day ${statuses[0]?.daysElapsed ?? 0} of ${statuses[0]?.daysInMonth ?? 0}` : undefined} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {statuses.map((s) => (
                  <BudgetCard key={s.budget.id} status={s} isCurrent={isCurrent} onEdit={() => setEditing(s.budget)} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <HistoryView budgets={budgets} endMonth={currentMonth} />
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={budgets.some((b) => b.id === editing?.id) ? 'Edit budget' : 'New budget'}>
        {editing && (
          <div className="grid gap-4">
            <Field label="Category">
              <select className="input" value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })} disabled={budgets.some((b) => b.id === editing.id)}>
                {budgetableCategories(categories)
                  .filter((c) => c.id === editing.categoryId || !budgets.some((b) => b.categoryId === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={`Monthly amount (${settings.currencySymbol})`}>
              <input type="number" min="0" step="1" className="input" value={editing.monthlyAmount ? toMajor(editing.monthlyAmount) : ''} onChange={(e) => setEditing({ ...editing, monthlyAmount: toMinor(parseFloat(e.target.value) || 0) })} autoFocus />
            </Field>
            <Toggle checked={editing.rollover} onChange={(v) => setEditing({ ...editing, rollover: v })} label="Roll unused budget over into the next month" />
            <div className="flex justify-between">
              {budgets.some((b) => b.id === editing.id) ? (
                <button
                  className="btn-ghost text-red-600"
                  onClick={async () => {
                    await deleteBudget(editing.id);
                    setEditing(null);
                  }}
                >
                  <Trash2 size={14} /> Remove
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={!editing.categoryId || editing.monthlyAmount <= 0}
                  onClick={async () => {
                    await saveBudget(editing);
                    setEditing(null);
                    toast('Budget saved', 'success');
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );

  function BudgetCard({ status: s, isCurrent, onEdit }: { status: BudgetStatus; isCurrent: boolean; onEdit: () => void }) {
    const cat = catMap.get(s.categoryId);
    const pct = Math.min(100, s.effectiveBudget > 0 ? (s.spent / s.effectiveBudget) * 100 : 100);
    const projPct = Math.min(100, s.effectiveBudget > 0 ? (s.projected / s.effectiveBudget) * 100 : 100);
    return (
      <button className="card p-4 text-left transition hover:border-indigo-300 dark:hover:border-indigo-700" onClick={onEdit}>
        <div className="flex items-center justify-between gap-2">
          <CategoryBadge category={cat} />
          <span className={`text-xs font-medium ${STATE_TEXT[s.state]}`}>{s.state === 'ok' ? 'On track' : s.state === 'near' ? 'Near limit' : 'Over budget'}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xl font-semibold tabular-nums">{fmt(s.spent)}</span>
          <span className="text-sm text-slate-500">
            of {fmt(s.effectiveBudget)}
            {s.carriedIn > 0 && <span className="ml-1 text-xs text-emerald-600">(+{fmt(s.carriedIn)} rolled over)</span>}
          </span>
        </div>
        <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          {isCurrent && s.projected > s.spent && <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${projPct}%` }} title="Projected" />}
          <div className={`absolute inset-y-0 left-0 rounded-full ${STATE_COLORS[s.state]}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{s.remaining >= 0 ? `${fmt(s.remaining)} left` : `${fmt(-s.remaining)} over`}</span>
          {isCurrent && <span className={s.projected > s.effectiveBudget ? 'text-red-600 dark:text-red-400' : ''}>Projected {fmt(s.projected)}</span>}
        </div>
      </button>
    );
  }

  function HistoryView({ budgets, endMonth }: { budgets: Budget[]; endMonth: string }) {
    const months = 6;
    const keys = monthKeysBetween(shiftMonthKey(endMonth, -(months - 1)), endMonth);
    const rows = budgets.map((b) => ({ budget: b, history: budgetHistory(b, txs, endMonth, months, opts) }));
    if (budgets.length === 0) return <EmptyState title="No budgets yet" />;
    return (
      <Card title={`Actual vs budget, last ${months} months`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="th">Category</th>
                {keys.map((k) => (
                  <th key={k} className="th text-right">
                    {monthShortLabel(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ budget, history }) => (
                <tr key={budget.id} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="td">
                    <CategoryBadge category={catMap.get(budget.categoryId)} />
                  </td>
                  {history.map((h) => (
                    <td key={h.month} className="td text-right">
                      <div className={`font-medium tabular-nums ${STATE_TEXT[h.state]}`}>{fmt(h.actual, { compact: true })}</div>
                      <div className="text-xs text-slate-400">/ {fmt(h.budget, { compact: true })}</div>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="td font-medium">Total</td>
                {keys.map((k, i) => {
                  const actual = rows.reduce((s, r) => s + r.history[i].actual, 0);
                  const bud = rows.reduce((s, r) => s + r.history[i].budget, 0);
                  return (
                    <td key={k} className="td text-right">
                      <div className={`font-medium tabular-nums ${actual > bud ? STATE_TEXT.over : STATE_TEXT.ok}`}>{fmt(actual, { compact: true })}</div>
                      <div className="text-xs text-slate-400">/ {fmt(bud, { compact: true })}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
}
