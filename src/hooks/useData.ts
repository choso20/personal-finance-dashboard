import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { db } from '../db/schema';
import { DEFAULT_SETTINGS } from '../db/repo';
import { categoryMap } from '../lib/analytics';
import { formatMoney, type FormatOptions } from '../lib/money';
import type { Category } from '../types';

export function useTransactions() {
  return useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
}

export function useCategoryMap() {
  const cats = useCategories();
  return useMemo(() => categoryMap(cats ?? []), [cats]);
}

export function useRules() {
  return useLiveQuery(() => db.rules.orderBy('priority').toArray(), []);
}

export function useBudgets() {
  return useLiveQuery(() => db.budgets.toArray(), []);
}

export function useProfiles() {
  return useLiveQuery(() => db.bankProfiles.orderBy('createdAt').toArray(), []);
}

export function useDecisions() {
  return useLiveQuery(() => db.subscriptionDecisions.toArray(), []);
}

export function useImportBatches() {
  return useLiveQuery(() => db.importBatches.orderBy('createdAt').reverse().limit(20).toArray(), []);
}

export function useSettings() {
  const s = useLiveQuery(() => db.settings.get('settings'), []);
  return s ?? DEFAULT_SETTINGS;
}

/** Money formatter bound to the user's currency symbol */
export function useMoney() {
  const { currencySymbol } = useSettings();
  return useCallback((minor: number, opts: FormatOptions = {}) => formatMoney(minor, { symbol: currencySymbol, ...opts }), [currencySymbol]);
}
