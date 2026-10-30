import type {
  Backup,
  BankProfile,
  Budget,
  Category,
  ImportBatch,
  Rule,
  Settings,
  SubscriptionDecision,
  Transaction,
} from '../types';
import { DEFAULT_CATEGORIES, UNCATEGORIZED_ID } from '../lib/categories';
import { newId } from '../lib/ids';
import { applyRules, renumberPriorities } from '../lib/rules';
import { buildStarterRules } from '../lib/starterRules';
import { createBackup } from '../lib/backup';
import { db } from './schema';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currencySymbol: '£',
  firstDayOfWeek: 1,
  firstDayOfMonth: 1,
  theme: 'system',
};

/** Seed default categories, starter rules and settings on first run */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', [db.categories, db.rules, db.settings], async () => {
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(DEFAULT_CATEGORIES);
    if ((await db.rules.count()) === 0) await db.rules.bulkAdd(buildStarterRules());
    if (!(await db.settings.get('settings'))) await db.settings.add(DEFAULT_SETTINGS);
  });
}

// ---------- Settings ----------

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update('settings', patch);
}

// ---------- Transactions ----------

export async function existingHashes(): Promise<Set<string>> {
  const hashes = await db.transactions.orderBy('hash').keys();
  return new Set(hashes as string[]);
}

export interface ImportSummary {
  batchId: string;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  categorizedCount: number;
}

/** Persist new transactions, applying rules to them, and record the batch */
export async function commitImport(
  newTransactions: Transaction[],
  meta: { batchId: string; fileName: string; profileName?: string; duplicateCount: number; errorCount: number },
): Promise<ImportSummary> {
  const rules = await db.rules.toArray();
  const { updated, matchedCount } = applyRules(rules, newTransactions);
  const byId = new Map(updated.map((t) => [t.id, t]));
  const finalTxs = newTransactions.map((t) => byId.get(t.id) ?? t);
  const batch: ImportBatch = {
    id: meta.batchId,
    createdAt: Date.now(),
    fileName: meta.fileName,
    profileName: meta.profileName,
    newCount: finalTxs.length,
    duplicateCount: meta.duplicateCount,
    errorCount: meta.errorCount,
  };
  await db.transaction('rw', [db.transactions, db.importBatches], async () => {
    await db.transactions.bulkAdd(finalTxs);
    await db.importBatches.add(batch);
  });
  return {
    batchId: meta.batchId,
    newCount: finalTxs.length,
    duplicateCount: meta.duplicateCount,
    errorCount: meta.errorCount,
    categorizedCount: matchedCount,
  };
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, patch);
}

/** Manual category edit: sets isManual so rules never overwrite it */
export async function setTransactionCategory(ids: string[], categoryId: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await db.transactions.update(id, { categoryId, isManual: true });
  });
}

export async function setTransactionsExcluded(ids: string[], excluded: boolean): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await db.transactions.update(id, { excluded });
  });
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  await db.transactions.bulkDelete(ids);
}

/** Clear the manual flag so rules apply again */
export async function clearManualFlag(ids: string[]): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await db.transactions.update(id, { isManual: false });
  });
}

// ---------- Rules ----------

export async function saveRule(rule: Rule): Promise<void> {
  await db.rules.put(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id);
}

export async function nextRulePriority(): Promise<number> {
  const first = await db.rules.orderBy('priority').first();
  return first ? first.priority - 1 : 0;
}

export async function reorderRules(orderedRules: Rule[]): Promise<void> {
  const renumbered = renumberPriorities(orderedRules);
  await db.rules.bulkPut(renumbered);
}

export interface ReapplyResult {
  matched: number;
  changed: number;
}

/** Re-run all rules over every non-manual transaction */
export async function reapplyRules(opts: { resetUnmatched?: boolean } = {}): Promise<ReapplyResult> {
  const [rules, txs] = await Promise.all([db.rules.toArray(), db.transactions.toArray()]);
  const res = applyRules(rules, txs, opts.resetUnmatched ? { resetUnmatchedTo: UNCATEGORIZED_ID } : {});
  if (res.updated.length) await db.transactions.bulkPut(res.updated);
  return { matched: res.matchedCount, changed: res.updated.length };
}

// ---------- Categories ----------

export async function saveCategory(cat: Category): Promise<void> {
  await db.categories.put(cat);
}

/** Delete a category, moving its transactions, rules and budget to "Other" (or removing them) */
export async function deleteCategory(id: string): Promise<void> {
  if (id === UNCATEGORIZED_ID) throw new Error('The "Other" category cannot be deleted');
  await db.transaction('rw', [db.categories, db.transactions, db.rules, db.budgets], async () => {
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: UNCATEGORIZED_ID });
    await db.rules.filter((r) => r.action.categoryId === id).modify((r) => {
      r.action.categoryId = UNCATEGORIZED_ID;
    });
    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  });
}

// ---------- Budgets ----------

export async function saveBudget(b: Budget): Promise<void> {
  await db.budgets.put(b);
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id);
}

// ---------- Bank profiles ----------

export async function saveProfile(p: BankProfile): Promise<void> {
  await db.bankProfiles.put(p);
}

export async function deleteProfile(id: string): Promise<void> {
  await db.bankProfiles.delete(id);
}

// ---------- Subscription decisions ----------

export async function saveDecision(d: SubscriptionDecision): Promise<void> {
  await db.subscriptionDecisions.put(d);
}

export async function deleteDecision(key: string): Promise<void> {
  await db.subscriptionDecisions.delete(key);
}

// ---------- Backup ----------

export async function exportBackup(): Promise<Backup> {
  const [transactions, categories, rules, budgets, bankProfiles, subscriptionDecisions, settings] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.rules.toArray(),
    db.budgets.toArray(),
    db.bankProfiles.toArray(),
    db.subscriptionDecisions.toArray(),
    db.settings.get('settings'),
  ]);
  return createBackup({ transactions, categories, rules, budgets, bankProfiles, subscriptionDecisions, settings });
}

/** Replace all data with the backup's contents */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.categories, db.rules, db.budgets, db.bankProfiles, db.subscriptionDecisions, db.settings, db.importBatches],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.rules.clear(),
        db.budgets.clear(),
        db.bankProfiles.clear(),
        db.subscriptionDecisions.clear(),
        db.importBatches.clear(),
      ]);
      await db.transactions.bulkAdd(b.transactions);
      await db.categories.bulkAdd(b.categories.length ? b.categories : DEFAULT_CATEGORIES);
      await db.rules.bulkAdd(b.rules);
      await db.budgets.bulkAdd(b.budgets);
      await db.bankProfiles.bulkAdd(b.bankProfiles);
      await db.subscriptionDecisions.bulkAdd(b.subscriptionDecisions);
      if (b.settings) await db.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, id: 'settings' });
    },
  );
}

/** Wipe everything and re-seed defaults */
export async function deleteAllData(): Promise<void> {
  await db.delete();
  await db.open();
  await ensureSeeded();
}

export { newId };
