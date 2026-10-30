import { ChevronDown, ChevronUp, GripVertical, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryBadge } from '../components/CategorySelect';
import { RuleEditor, type RuleDraft } from '../components/RuleEditor';
import { useToast } from '../components/Toast';
import { Card, ConfirmDialog, EmptyState, PageHeader, Toggle } from '../components/ui';
import { deleteCategory, deleteRule, reapplyRules, reorderRules, saveCategory, saveRule } from '../db/repo';
import { useCategories, useCategoryMap, useRules, useTransactions } from '../hooks/useData';
import { CATEGORY_PALETTE, UNCATEGORIZED_ID } from '../lib/categories';
import { newId } from '../lib/ids';
import { toMajor } from '../lib/money';
import { countMatches, moveItem } from '../lib/rules';
import type { Category, RuleCondition } from '../types';

export function RulesPage() {
  const [tab, setTab] = useState<'rules' | 'categories'>('rules');
  return (
    <div>
      <PageHeader title="Rules & categories" subtitle="Rules run top to bottom; the first match wins. Drag to reorder." />
      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['rules', 'categories'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${
              tab === t ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'rules' ? <RulesTab /> : <CategoriesTab />}
    </div>
  );
}

function describeCondition(c: RuleCondition, fmtMajor: (n: number) => string): string {
  switch (c.type) {
    case 'description':
      return `description ${c.op === 'startsWith' ? 'starts with' : c.op === 'regex' ? 'matches' : c.op} "${c.value}"`;
    case 'amountRange':
      return `amount ${c.min !== undefined ? `≥ ${fmtMajor(c.min)}` : ''}${c.min !== undefined && c.max !== undefined ? ' and ' : ''}${c.max !== undefined ? `≤ ${fmtMajor(c.max)}` : ''}`;
    case 'amountSign':
      return c.sign === 'debit' ? 'money out' : 'money in';
    case 'account':
      return `account is "${c.value}"`;
  }
}

function RulesTab() {
  const rules = useRules();
  const txs = useTransactions() ?? [];
  const catMap = useCategoryMap();
  const toast = useToast();
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [reapplying, setReapplying] = useState(false);
  const [filter, setFilter] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rules ?? []) m.set(r.id, countMatches(r, txs));
    return m;
  }, [rules, txs]);

  if (!rules) return null;

  const visible = filter.trim() ? rules.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()) || r.conditions.some((c) => 'value' in c && c.value.toLowerCase().includes(filter.toLowerCase()))) : rules;

  const onDrop = async (to: number) => {
    if (dragIndex === null || dragIndex === to) return;
    const next = moveItem(rules, dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
    await reorderRules(next);
  };

  const reapply = async () => {
    setReapplying(true);
    try {
      const r = await reapplyRules();
      toast(`Rules matched ${r.matched} transactions, ${r.changed} updated`, 'success');
    } finally {
      setReapplying(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => setDraft({ name: '', enabled: true, conditions: [{ type: 'description', op: 'contains', value: '' }], action: { categoryId: UNCATEGORIZED_ID } })}>
          <Plus size={16} /> New rule
        </button>
        <button className="btn-secondary" onClick={reapply} disabled={reapplying}>
          <RefreshCw size={16} className={reapplying ? 'animate-spin' : ''} /> Re-apply rules to all transactions
        </button>
        <input className="input ml-auto w-56" placeholder="Filter rules…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <p className="mb-3 text-xs text-slate-500">Re-applying never changes transactions whose category you set by hand.</p>

      {rules.length === 0 ? (
        <EmptyState title="No rules yet">Create a rule, or use "Create rule from this" on any transaction.</EmptyState>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {visible.map((r) => {
            const index = rules.indexOf(r);
            return (
              <div
                key={r.id}
                draggable={!filter}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(index);
                }}
                onDragLeave={() => setOverIndex(null)}
                onDrop={() => onDrop(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`flex items-center gap-3 px-3 py-2 ${overIndex === index && dragIndex !== index ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''} ${!r.enabled ? 'opacity-60' : ''}`}
              >
                <span className={`cursor-grab text-slate-400 ${filter ? 'invisible' : ''}`} title="Drag to reorder">
                  <GripVertical size={16} />
                </span>
                <Toggle checked={r.enabled} onChange={(v) => saveRule({ ...r, enabled: v })} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.isStarter && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">starter</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    If {r.conditions.map((c) => describeCondition(c, (n) => toMajor(n).toFixed(2))).join(' and ')}
                  </div>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <CategoryBadge category={catMap.get(r.action.categoryId)} />
                  {r.action.merchantName && <span className="text-xs text-slate-500">→ {r.action.merchantName}</span>}
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-slate-500" title="Matching transactions">
                  {counts.get(r.id) ?? 0} match{(counts.get(r.id) ?? 0) === 1 ? '' : 'es'}
                </span>
                <div className={`flex flex-col ${filter ? 'invisible' : ''}`}>
                  <button className="btn-ghost p-0.5" onClick={() => index > 0 && reorderRules(moveItem(rules, index, index - 1))} disabled={index === 0} aria-label="Move up">
                    <ChevronUp size={12} />
                  </button>
                  <button className="btn-ghost p-0.5" onClick={() => index < rules.length - 1 && reorderRules(moveItem(rules, index, index + 1))} disabled={index === rules.length - 1} aria-label="Move down">
                    <ChevronDown size={12} />
                  </button>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setDraft(r)} aria-label="Edit">
                  <Pencil size={14} />
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteId(r.id)} aria-label="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <RuleEditor open={draft !== null} draft={draft} onClose={() => setDraft(null)} />
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete rule"
        message="Delete this rule? Transactions it already categorized keep their category."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (confirmDeleteId) await deleteRule(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}

function CategoriesTab() {
  const categories = useCategories();
  const txs = useTransactions() ?? [];
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [newName, setNewName] = useState('');

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [txs]);

  if (!categories) return null;

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const color = CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length];
    await saveCategory({ id: newId('cat'), name, color, kind: 'expense', sortOrder: categories.length });
    setNewName('');
    toast('Category added', 'success');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="Categories">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} count={usage.get(c.id) ?? 0} onDelete={() => setConfirmDelete(c)} />
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Add category">
        <div className="flex gap-2">
          <input className="input" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add} disabled={!newName.trim()}>
            Add
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Kinds: <b>expense</b> counts as spending, <b>income</b> as income, and <b>transfer</b> is ignored in reports (e.g. moving money between your own accounts).
        </p>
      </Card>
      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete "${confirmDelete?.name}"`}
        message={`${usage.get(confirmDelete?.id ?? '') ?? 0} transaction(s) and any rules using it will be moved to "Other". Its budget will be removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            try {
              await deleteCategory(confirmDelete.id);
              toast('Category deleted', 'success');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Could not delete', 'error');
            }
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function CategoryRow({ category, count, onDelete }: { category: Category; count: number; onDelete: () => void }) {
  const [name, setName] = useState(category.name);
  const isOther = category.id === UNCATEGORIZED_ID;
  const commitName = async () => {
    const n = name.trim();
    if (n && n !== category.name) await saveCategory({ ...category, name: n });
    else setName(category.name);
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <input
        type="color"
        value={category.color}
        onChange={(e) => saveCategory({ ...category, color: e.target.value })}
        className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
        title="Color"
      />
      <input className="input w-48" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <select className="input w-32" value={category.kind} onChange={(e) => saveCategory({ ...category, kind: e.target.value as Category['kind'] })}>
        <option value="expense">expense</option>
        <option value="income">income</option>
        <option value="transfer">transfer</option>
      </select>
      <span className="text-xs text-slate-500">{count} tx</span>
      <button className="btn-ghost btn-sm ml-auto" onClick={onDelete} disabled={isOther} title={isOther ? 'The fallback category cannot be deleted' : 'Delete'}>
        <Trash2 size={14} />
      </button>
    </li>
  );
}
