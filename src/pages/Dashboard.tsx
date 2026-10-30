import { LayoutDashboard } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, PageHeader, Stat } from '../components/ui';
import { useCategories, useCategoryMap, useMoney, useSettings, useTransactions } from '../hooks/useData';
import {
  categoryBreakdown,
  flowByMonth,
  previousPeriodFor,
  resolvePeriod,
  spendingByCategoryByMonth,
  summarize,
  topMerchants,
  type Period,
  type PeriodPreset,
} from '../lib/analytics';
import { monthRange, monthShortLabel, todayISO } from '../lib/dates';
import { pctChange } from '../lib/money';

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'last3', label: '3 months' },
  { key: 'last6', label: '6 months' },
  { key: 'last12', label: '12 months' },
  { key: 'custom', label: 'Custom' },
];

export function DashboardPage() {
  const txs = useTransactions();
  const categories = useCategories() ?? [];
  const catMap = useCategoryMap();
  const settings = useSettings();
  const fmt = useMoney();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [custom, setCustom] = useState<Period>(() => resolvePeriod('last3'));

  const period = useMemo(() => resolvePeriod(preset, { firstDayOfMonth: settings.firstDayOfMonth, custom }), [preset, custom, settings.firstDayOfMonth]);
  const prev = useMemo(() => previousPeriodFor(preset, period, settings.firstDayOfMonth), [preset, period, settings.firstDayOfMonth]);

  const all = txs ?? [];
  const summary = useMemo(() => summarize(all, catMap, period), [all, catMap, period]);
  const prevSummary = useMemo(() => summarize(all, catMap, prev), [all, catMap, prev]);
  const byMonth = useMemo(() => spendingByCategoryByMonth(all, catMap, period, settings.firstDayOfMonth), [all, catMap, period, settings.firstDayOfMonth]);
  const flow = useMemo(() => flowByMonth(all, catMap, period, settings.firstDayOfMonth), [all, catMap, period, settings.firstDayOfMonth]);
  const breakdown = useMemo(() => categoryBreakdown(all, catMap, period), [all, catMap, period]);
  const merchants = useMemo(() => topMerchants(all, catMap, period, 10), [all, catMap, period]);

  const activeCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of byMonth) for (const id of Object.keys(row.values)) ids.add(id);
    return categories.filter((c) => ids.has(c.id)).map((c) => c.id);
  }, [byMonth, categories]);

  const major = (minor: number) => minor / 100;
  const axisFmt = (v: number) => fmt(v * 100, { compact: true });

  const drill = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ from: period.start, to: period.end, ...extra });
    navigate(`/transactions?${p.toString()}`);
  };

  if (!txs) return null;
  if (txs.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <EmptyState title="Nothing to show yet" icon={<LayoutDashboard size={32} />}>
          <Link to="/import" className="text-indigo-600 underline dark:text-indigo-400">
            Import a CSV
          </Link>{' '}
          (or try the sample data) to see your spending trends.
        </EmptyState>
      </div>
    );
  }

  const change = (a: number, b: number) => {
    const pc = pctChange(a, b);
    if (pc === null) return 'no previous data';
    const sign = pc > 0 ? '+' : '';
    return `${sign}${pc.toFixed(0)}% vs previous`;
  };

  const monthData = byMonth.map((r) => ({ month: r.month, label: monthShortLabel(r.month), ...Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, major(v)])) }));
  const flowData = flow.map((r) => ({ label: monthShortLabel(r.month), Income: major(r.income), Spending: major(r.spending), Net: major(r.net) }));
  const pieData = breakdown.map((s) => ({ ...s, value: major(s.amount) }));
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const tickColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${period.start} to ${period.end}`}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => setPreset(p.key)} className={preset === p.key ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <>
                <input type="date" className="input w-auto" value={custom.start} max={custom.end} onChange={(e) => e.target.value && setCustom({ ...custom, start: e.target.value })} />
                <input type="date" className="input w-auto" value={custom.end} min={custom.start} onChange={(e) => e.target.value && setCustom({ ...custom, end: e.target.value })} />
              </>
            )}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Income" value={fmt(summary.income)} sub={change(prevSummary.income, summary.income)} />
        <Stat label="Spending" value={fmt(summary.spending)} sub={change(prevSummary.spending, summary.spending)} />
        <Stat label="Net" value={fmt(summary.net, { signed: true })} tone={summary.net >= 0 ? 'good' : 'bad'} sub={change(prevSummary.net, summary.net)} />
        <Stat
          label="Savings rate"
          value={summary.savingsRate === null ? '—' : `${(summary.savingsRate * 100).toFixed(0)}%`}
          tone={summary.savingsRate === null ? 'neutral' : summary.savingsRate >= 0 ? 'good' : 'bad'}
          sub={prevSummary.savingsRate === null ? 'no previous data' : `${(prevSummary.savingsRate * 100).toFixed(0)}% previous`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Monthly spending by category">
          {monthData.length === 0 || activeCategoryIds.length === 0 ? (
            <NoData />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={monthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={axisFmt} tick={{ fill: tickColor, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v: number, name: string) => [fmt(Math.round(v * 100)), catMap.get(name)?.name ?? name]} cursor={{ fill: isDark ? '#1e293b' : '#f1f5f9' }} />
                  {activeCategoryIds.map((id) => (
                    <Bar
                      key={id}
                      dataKey={id}
                      stackId="spend"
                      fill={catMap.get(id)?.color}
                      maxBarSize={96}
                      cursor="pointer"
                      onClick={(data: { month?: string }) => {
                        if (!data?.month) return;
                        const r = monthRange(data.month, settings.firstDayOfMonth);
                        navigate(`/transactions?${new URLSearchParams({ from: r.start, to: r.end, category: id }).toString()}`);
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">Click a segment to see those transactions.</p>
        </Card>

        <Card title="Income vs spending">
          {flowData.length === 0 ? (
            <NoData />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={flowData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={axisFmt} tick={{ fill: tickColor, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v: number) => fmt(Math.round(v * 100))} />
                  <Legend />
                  <Line type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2} dot={flowData.length < 3} />
                  <Line type="monotone" dataKey="Spending" stroke="#ef4444" strokeWidth={2} dot={flowData.length < 3} />
                  <Line type="monotone" dataKey="Net" stroke="#6366f1" strokeWidth={2} dot={flowData.length < 3} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Category breakdown">
          {pieData.length === 0 ? (
            <NoData />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-64 w-full sm:w-1/2">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} cursor="pointer" onClick={(d: { categoryId?: string }) => d?.categoryId && drill({ category: d.categoryId })}>
                      {pieData.map((s) => (
                        <Cell key={s.categoryId} fill={s.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(Math.round(v * 100))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-1 text-sm sm:w-1/2">
                {breakdown.slice(0, 8).map((s) => (
                  <li key={s.categoryId}>
                    <button className="flex w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => drill({ category: s.categoryId })}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto tabular-nums text-slate-500">{(s.share * 100).toFixed(0)}%</span>
                      <span className="w-20 text-right tabular-nums">{fmt(s.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Top merchants">
          {merchants.length === 0 ? (
            <NoData />
          ) : (
            <ul className="space-y-2">
              {merchants.map((m) => {
                const max = merchants[0].amount;
                return (
                  <li key={m.merchant}>
                    <button className="group w-full text-left" onClick={() => drill({ merchant: m.merchant })}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate group-hover:underline">{m.merchant}</span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {m.count}× · <span className="font-medium text-slate-800 dark:text-slate-100">{fmt(m.amount)}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.max(2, (m.amount / max) * 100)}%` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-slate-400">Transfers and excluded transactions are not counted. Today: {todayISO()}.</p>
    </div>
  );
}

function NoData() {
  return <div className="flex h-40 items-center justify-center text-sm text-slate-400">No data in this period</div>;
}
