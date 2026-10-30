import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { nextRulePriority, reapplyRules, saveRule } from '../db/repo';
import { useCategories, useMoney, useTransactions } from '../hooks/useData';
import { newId } from '../lib/ids';
import { toMajor, toMinor } from '../lib/money';
import { regexError, ruleMatches } from '../lib/rules';
import type { Rule, RuleCondition, Transaction } from '../types';
import { CategorySelect } from './CategorySelect';
import { Field, Modal } from './ui';
import { useToast } from './Toast';

export type RuleDraft = Omit<Rule, 'id' | 'priority'> & { id?: string; priority?: number };

/** Pre-fill a draft rule from a transaction ("Create rule from this") */
export function draftFromTransaction(tx: Transaction, matchText: string): RuleDraft {
  return {
    name: tx.merchant || matchText,
    enabled: true,
    conditions: [
      { type: 'description', op: 'contains', value: matchText },
      { type: 'amountSign', sign: tx.amount < 0 ? 'debit' : 'credit' },
    ],
    action: { categoryId: tx.categoryId, merchantName: tx.merchant },
  };
}

export function RuleEditor({ open, draft, onClose, onSaved }: { open: boolean; draft: RuleDraft | null; onClose: () => void; onSaved?: (rule: Rule) => void }) {
  const categories = useCategories() ?? [];
  const txs = useTransactions() ?? [];
  const fmt = useMoney();
  const toast = useToast();
  const [rule, setRule] = useState<RuleDraft | null>(draft);
  const [saving, setSaving] = useState(false);

  useEffect(() => setRule(draft), [draft, open]);

  const preview = useMemo(() => {
    if (!rule) return { count: 0, sample: [] as Transaction[] };
    const probe: Rule = { id: 'preview', priority: 0, ...rule };
    const matched: Transaction[] = [];
    let count = 0;
    for (const t of txs) {
      if (ruleMatches(probe, t)) {
        count++;
        if (matched.length < 5) matched.push(t);
      }
    }
    return { count, sample: matched };
  }, [rule, txs]);

  if (!rule) return null;

  const update = (patch: Partial<RuleDraft>) => setRule({ ...rule, ...patch });
  const setCond = (i: number, c: RuleCondition) => update({ conditions: rule.conditions.map((x, j) => (j === i ? c : x)) });
  const removeCond = (i: number) => update({ conditions: rule.conditions.filter((_, j) => j !== i) });
  const addCond = (type: RuleCondition['type']) => {
    const c: RuleCondition =
      type === 'description'
        ? { type, op: 'contains', value: '' }
        : type === 'amountRange'
          ? { type }
          : type === 'amountSign'
            ? { type, sign: 'debit' }
            : { type, value: '' };
    update({ conditions: [...rule.conditions, c] });
  };

  const errors: string[] = [];
  if (!rule.name.trim()) errors.push('Give the rule a name.');
  if (rule.conditions.length === 0) errors.push('Add at least one condition.');
  rule.conditions.forEach((c, i) => {
    if (c.type === 'description' && c.op !== 'regex' && !c.value.trim()) errors.push(`Condition ${i + 1} needs a value.`);
    if (c.type === 'description' && c.op === 'regex') {
      const err = regexError(c.value);
      if (err) errors.push(`Condition ${i + 1}: ${err}`);
    }
    if (c.type === 'account' && !c.value.trim()) errors.push(`Condition ${i + 1} needs an account name.`);
  });
  if (!rule.action.categoryId) errors.push('Choose a category.');

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    try {
      const priority = rule.priority ?? (await nextRulePriority());
      const full: Rule = {
        ...rule,
        id: rule.id ?? newId('rule'),
        priority,
        name: rule.name.trim(),
        action: { categoryId: rule.action.categoryId, merchantName: rule.action.merchantName?.trim() || undefined },
      };
      await saveRule(full);
      const applied = await reapplyRules();
      toast(applied.changed > 0 ? `Rule saved · ${applied.changed} transaction${applied.changed === 1 ? '' : 's'} updated` : 'Rule saved', 'success');
      onSaved?.(full);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={rule.id ? 'Edit rule' : 'New rule'} wide>
      <div className="grid gap-4">
        <Field label="Name">
          <input className="input" value={rule.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Tesco groceries" />
        </Field>

        <div>
          <div className="label">Conditions (all must match)</div>
          <div className="space-y-2">
            {rule.conditions.map((c, i) => (
              <ConditionRow key={i} cond={c} onChange={(nc) => setCond(i, nc)} onRemove={() => removeCond(i)} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => addCond('description')}>
              <Plus size={14} /> Description
            </button>
            <button className="btn-secondary btn-sm" onClick={() => addCond('amountRange')}>
              <Plus size={14} /> Amount range
            </button>
            <button className="btn-secondary btn-sm" onClick={() => addCond('amountSign')}>
              <Plus size={14} /> Money in/out
            </button>
            <button className="btn-secondary btn-sm" onClick={() => addCond('account')}>
              <Plus size={14} /> Account
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Set category">
            <CategorySelect value={rule.action.categoryId} onChange={(id) => update({ action: { ...rule.action, categoryId: id } })} categories={categories} />
          </Field>
          <Field label="Rename merchant to (optional)">
            <input
              className="input"
              value={rule.action.merchantName ?? ''}
              onChange={(e) => update({ action: { ...rule.action, merchantName: e.target.value } })}
              placeholder="Clean display name, e.g. Tesco"
            />
          </Field>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <div className="font-medium">
            Matches {preview.count} of {txs.length} transaction{txs.length === 1 ? '' : 's'}
          </div>
          {preview.sample.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {preview.sample.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {t.date} · {t.description}
                  </span>
                  <span className="shrink-0 tabular-nums">{fmt(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {errors.length > 0 && (
          <ul className="list-inside list-disc text-xs text-red-600 dark:text-red-400">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={errors.length > 0 || saving}>
            Save rule
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConditionRow({ cond, onChange, onRemove }: { cond: RuleCondition; onChange: (c: RuleCondition) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
      {cond.type === 'description' && (
        <>
          <span className="text-sm text-slate-500">Description</span>
          <select className="input w-auto" value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as typeof cond.op })}>
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="startsWith">starts with</option>
            <option value="regex">matches regex</option>
          </select>
          <input className="input min-w-[12rem] flex-1" value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder={cond.op === 'regex' ? '^TESCO\\s' : 'text'} />
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" checked={cond.caseSensitive ?? false} onChange={(e) => onChange({ ...cond, caseSensitive: e.target.checked })} />
            case sensitive
          </label>
        </>
      )}
      {cond.type === 'amountRange' && <AmountRangeFields cond={cond} onChange={onChange} />}
      {cond.type === 'amountSign' && (
        <>
          <span className="text-sm text-slate-500">Money</span>
          <select className="input w-auto" value={cond.sign} onChange={(e) => onChange({ ...cond, sign: e.target.value as 'debit' | 'credit' })}>
            <option value="debit">out (debit)</option>
            <option value="credit">in (credit)</option>
          </select>
        </>
      )}
      {cond.type === 'account' && (
        <>
          <span className="text-sm text-slate-500">Account is</span>
          <input className="input min-w-[10rem] flex-1" value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder="Account name" />
        </>
      )}
      <button className="btn-ghost btn-sm ml-auto" onClick={onRemove} aria-label="Remove condition">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AmountRangeFields({ cond, onChange }: { cond: Extract<RuleCondition, { type: 'amountRange' }>; onChange: (c: RuleCondition) => void }) {
  return (
    <>
      <span className="text-sm text-slate-500">Amount between</span>
      <input
        type="number"
        step="0.01"
        min="0"
        className="input w-28"
        value={cond.min === undefined ? '' : toMajor(cond.min)}
        onChange={(e) => onChange({ ...cond, min: e.target.value === '' ? undefined : toMinor(parseFloat(e.target.value)) })}
        placeholder="min"
      />
      <span className="text-sm text-slate-500">and</span>
      <input
        type="number"
        step="0.01"
        min="0"
        className="input w-28"
        value={cond.max === undefined ? '' : toMajor(cond.max)}
        onChange={(e) => onChange({ ...cond, max: e.target.value === '' ? undefined : toMinor(parseFloat(e.target.value)) })}
        placeholder="max"
      />
      <span className="text-xs text-slate-400">(ignores sign)</span>
    </>
  );
}
