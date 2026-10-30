import { ArrowDown, ArrowUp, Download, EyeOff, ListFilter, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CategoryBadge, CategorySelect } from '../components/CategorySelect';
import { RuleEditor, draftFromTransaction, type RuleDraft } from '../components/RuleEditor';
import { useToast } from '../components/Toast';
import { ConfirmDialog, EmptyState, PageHeader, downloadText } from '../components/ui';
import { deleteTransactions, setTransactionCategory, setTransactionsExcluded, updateTransaction } from '../db/repo';
import { useCategories, useCategoryMap, useMoney, useTransactions } from '../hooks/useData';
import { accountNames } from '../lib/analytics';
import { UNCATEGORIZED_ID } from '../lib/categories';
import { transactionsToCsv } from '../lib/csv';
import { toMinor } from '../lib/money';
import { suggestMatchText } from '../lib/normalize';
import type { Transaction } from '../types';

type SortKey = 'date' | 'description' | 'amount' | 'category' | 'account';
const PAGE_SIZE = 100;

export function TransactionsPage() {
  const txs = useTransactions();
  const categories = useCategories() ?? [];
  const catMap = useCategoryMap();
  const fmt = useMoney();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  // Filters live in the URL so chart drill-downs can link here
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const account = params.get('account') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const merchant = params.get('merchant') ?? '';
  const uncategorized = params.get('uncategorized') === '1';
  const minAmt = params.get('min') ?? '';
  const maxAmt = params.get('max') ?? '';
  const showExcluded = params.get('excluded') !== '0';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });
  const hasFilters = [q, category, account, from, to, merchant, minAmt, maxAmt].some(Boolean) || uncategorized || !showExcluded;

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const page = parseInt(params.get('page') ?? '1', 10) || 1;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [bulkCategory, setBulkCategory] = useState('');

  const accounts = useMemo(() => accountNames(txs ?? []), [txs]);

  const filtered = useMemo(() => {
    if (!txs) return [];
    const needle = q.trim().toLowerCase();
    const min = minAmt ? toMinor(parseFloat(minAmt)) : null;
    const max = maxAmt ? toMinor(parseFloat(maxAmt)) : null;
    const merchantKey = merchant.trim().toLowerCase();
    return txs.filter((t) => {
      if (needle && !(t.description.toLowerCase().includes(needle) || t.merchant.toLowerCase().includes(needle) || t.notes.toLowerCase().includes(needle))) return false;
      if (category && t.categoryId !== category) return false;
      if (uncategorized && t.categoryId !== UNCATEGORIZED_ID) return false;
      if (account && t.account !== account) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (merchantKey && t.merchant.toLowerCase() !== merchantKey) return false;
      if (min !== null && Math.abs(t.amount) < min) return false;
      if (max !== null && Math.abs(t.amount) > max) return false;
      if (!showExcluded && t.excluded) return false;
      return true;
    });
  }, [txs, q, category, uncategorized, account, from, to, merchant, minAmt, maxAmt, showExcluded]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const name = (id: string) => catMap.get(id)?.name ?? '';
    return filtered.slice().sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'date':
          c = a.date.localeCompare(b.date) || a.importedAt - b.importedAt;
          break;
        case 'description':
          c = (a.merchant || a.description).localeCompare(b.merchant || b.description);
          break;
        case 'amount':
          c = a.amount - b.amount;
          break;
        case 'category':
          c = name(a.categoryId).localeCompare(name(b.categoryId));
          break;
        case 'account':
          c = a.account.localeCompare(b.account);
          break;
      }
      return c * dir;
    });
  }, [filtered, sortKey, sortDir, catMap]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const total = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered]);

  useEffect(() => {
    // Drop selections that are no longer visible
    setSelected((s) => new Set([...s].filter((id) => filtered.some((t) => t.id === id))));
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'date' || k === 'amount' ? 'desc' : 'asc');
    }
  };

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((t) => selected.has(t.id));
  const toggleAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPageSelected) pageRows.forEach((t) => next.delete(t.id));
      else pageRows.forEach((t) => next.add(t.id));
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const csv = transactionsToCsv(sorted, (id) => catMap.get(id)?.name ?? '');
    downloadText(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  };

  const bulkSetCategory = async () => {
    if (!bulkCategory || selected.size === 0) return;
    await setTransactionCategory([...selected], bulkCategory);
    toast(`Updated ${selected.size} transaction${selected.size === 1 ? '' : 's'}`, 'success');
    setSelected(new Set());
    setBulkCategory('');
  };

  if (!txs) return null;
  if (txs.length === 0) {
    return (
      <div>
        <PageHeader title="Transactions" />
        <EmptyState title="No transactions yet" icon={<ListFilter size={32} />}>
          <Link to="/import" className="text-indigo-600 underline dark:text-indigo-400">
            Import a CSV
          </Link>{' '}
          to get started.
        </EmptyState>
      </div>
    );
  }

  const SortHeader = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`th cursor-pointer select-none ${className}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={`${filtered.length} of ${txs.length} transactions · net ${fmt(total, { signed: true })}`}
        actions={
          <button className="btn-secondary" onClick={exportCsv}>
            <Download size={16} /> Export CSV
          </button>
        }
      />

      {/* Filters */}
      <div className="card mb-4 p-3">
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <input className="input md:col-span-2" placeholder="Search description, merchant, notes…" value={q} onChange={(e) => setParam('q', e.target.value)} />
          <CategorySelect value={category} onChange={(v) => setParam('category', v)} categories={categories} allowEmpty="All categories" />
          <select className="input" value={account} onChange={(e) => setParam('account', e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input type="date" className="input" value={from} onChange={(e) => setParam('from', e.target.value)} title="From" />
          <input type="date" className="input" value={to} onChange={(e) => setParam('to', e.target.value)} title="To" />
          <input type="number" step="0.01" min="0" className="input" placeholder="Min amount" value={minAmt} onChange={(e) => setParam('min', e.target.value)} />
          <input type="number" step="0.01" min="0" className="input" placeholder="Max amount" value={maxAmt} onChange={(e) => setParam('max', e.target.value)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={uncategorized} onChange={(e) => setParam('uncategorized', e.target.checked ? '1' : '')} />
            Uncategorized only
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showExcluded} onChange={(e) => setParam('excluded', e.target.checked ? '' : '0')} />
            Show excluded
          </label>
          {merchant && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              Merchant: {merchant}
              <button onClick={() => setParam('merchant', '')} aria-label="Clear merchant filter">
                <X size={12} />
              </button>
            </span>
          )}
          {hasFilters && (
            <button className="btn-ghost btn-sm ml-auto" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm dark:bg-indigo-950/40">
          <span className="font-medium">{selected.size} selected</span>
          <CategorySelect value={bulkCategory} onChange={setBulkCategory} categories={categories} allowEmpty="Set category…" className="w-auto" />
          <button className="btn-primary btn-sm" onClick={bulkSetCategory} disabled={!bulkCategory}>
            Apply
          </button>
          <button className="btn-secondary btn-sm" onClick={async () => { await setTransactionsExcluded([...selected], true); setSelected(new Set()); }}>
            <EyeOff size={14} /> Exclude from reports
          </button>
          <button className="btn-secondary btn-sm" onClick={async () => { await setTransactionsExcluded([...selected], false); setSelected(new Set()); }}>
            Include in reports
          </button>
          <button className="btn-secondary btn-sm text-red-600" onClick={() => setConfirmDelete([...selected])}>
            <Trash2 size={14} /> Delete
          </button>
          <button className="btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th w-8">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all on page" />
              </th>
              <SortHeader k="date">Date</SortHeader>
              <SortHeader k="description">Description</SortHeader>
              <SortHeader k="category">Category</SortHeader>
              <SortHeader k="amount" className="text-right">
                Amount
              </SortHeader>
              <SortHeader k="account">Account</SortHeader>
              <th className="th">Notes</th>
              <th className="th w-24"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((t) => (
              <Row
                key={t.id}
                tx={t}
                selected={selected.has(t.id)}
                onToggle={() => toggleOne(t.id)}
                categories={categories}
                catMap={catMap}
                fmt={fmt}
                onCreateRule={() => setRuleDraft(draftFromTransaction(t, suggestMatchText(t.description)))}
                onDelete={() => setConfirmDelete([t.id])}
              />
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-slate-500" colSpan={8}>
                  No transactions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {pageCount}
          </span>
          <button className="btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => setParam('page', String(page + 1))}>
            Next
          </button>
        </div>
      )}

      <RuleEditor open={ruleDraft !== null} draft={ruleDraft} onClose={() => setRuleDraft(null)} />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete transactions"
        message={`Delete ${confirmDelete?.length ?? 0} transaction${confirmDelete?.length === 1 ? '' : 's'}? They will be re-imported next time if they appear in a CSV.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await deleteTransactions(confirmDelete);
            setSelected(new Set());
            toast('Deleted', 'success');
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function Row({
  tx,
  selected,
  onToggle,
  categories,
  catMap,
  fmt,
  onCreateRule,
  onDelete,
}: {
  tx: Transaction;
  selected: boolean;
  onToggle: () => void;
  categories: ReturnType<typeof useCategories> & {};
  catMap: ReturnType<typeof useCategoryMap>;
  fmt: ReturnType<typeof useMoney>;
  onCreateRule: () => void;
  onDelete: () => void;
}) {
  const [editingCat, setEditingCat] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const cat = catMap.get(tx.categoryId);
  const credit = tx.amount > 0;
  return (
    <tr className={`border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40 ${tx.excluded ? 'opacity-50' : ''}`}>
      <td className="td">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Select" />
      </td>
      <td className="td whitespace-nowrap font-mono text-xs">{tx.date}</td>
      <td className="td max-w-[20rem]">
        <div className="truncate font-medium">{tx.merchant || tx.description}</div>
        {tx.merchant && tx.merchant.toLowerCase() !== tx.description.toLowerCase() && <div className="truncate text-xs text-slate-500">{tx.description}</div>}
      </td>
      <td className="td">
        {editingCat ? (
          <CategorySelect
            value={tx.categoryId}
            categories={categories}
            className="w-auto"
            onChange={async (id) => {
              await setTransactionCategory([tx.id], id);
              setEditingCat(false);
            }}
          />
        ) : (
          <button onClick={() => setEditingCat(true)} title={tx.isManual ? 'Set manually (rules will not change it)' : 'Click to change'} className="inline-flex items-center gap-1">
            <CategoryBadge category={cat} />
            {tx.isManual && <span className="text-[10px] text-slate-400">manual</span>}
          </button>
        )}
      </td>
      <td className={`td whitespace-nowrap text-right tabular-nums ${credit ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{fmt(tx.amount, { signed: true })}</td>
      <td className="td text-xs text-slate-500">{tx.account}</td>
      <td className="td max-w-[12rem]">
        {notes === null ? (
          <button className="block w-full truncate text-left text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setNotes(tx.notes)} title="Edit notes">
            {tx.notes || <span className="italic text-slate-400">add note</span>}
          </button>
        ) : (
          <input
            className="input py-0.5 text-xs"
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={async () => {
              if (notes !== tx.notes) await updateTransaction(tx.id, { notes });
              setNotes(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setNotes(null);
            }}
          />
        )}
      </td>
      <td className="td whitespace-nowrap text-right">
        <button className="btn-ghost btn-sm" title="Create rule from this" onClick={onCreateRule}>
          <ListFilter size={14} />
        </button>
        <button className="btn-ghost btn-sm" title={tx.excluded ? 'Include in reports' : 'Exclude from reports'} onClick={() => updateTransaction(tx.id, { excluded: !tx.excluded })}>
          <EyeOff size={14} className={tx.excluded ? 'text-amber-500' : ''} />
        </button>
        <button className="btn-ghost btn-sm" title="Delete" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
