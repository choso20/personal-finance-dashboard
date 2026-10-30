import type { Category } from '../types';

export const UNCATEGORIZED_ID = 'cat_other';
export const INCOME_ID = 'cat_income';
export const TRANSFERS_ID = 'cat_transfers';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_groceries', name: 'Groceries', color: '#22c55e', kind: 'expense', sortOrder: 0, isDefault: true },
  { id: 'cat_dining', name: 'Dining', color: '#f97316', kind: 'expense', sortOrder: 1, isDefault: true },
  { id: 'cat_transport', name: 'Transport', color: '#3b82f6', kind: 'expense', sortOrder: 2, isDefault: true },
  { id: 'cat_rent', name: 'Rent/Mortgage', color: '#8b5cf6', kind: 'expense', sortOrder: 3, isDefault: true },
  { id: 'cat_utilities', name: 'Utilities', color: '#eab308', kind: 'expense', sortOrder: 4, isDefault: true },
  { id: 'cat_subscriptions', name: 'Subscriptions', color: '#ec4899', kind: 'expense', sortOrder: 5, isDefault: true },
  { id: 'cat_shopping', name: 'Shopping', color: '#14b8a6', kind: 'expense', sortOrder: 6, isDefault: true },
  { id: 'cat_entertainment', name: 'Entertainment', color: '#a855f7', kind: 'expense', sortOrder: 7, isDefault: true },
  { id: 'cat_health', name: 'Health', color: '#ef4444', kind: 'expense', sortOrder: 8, isDefault: true },
  { id: 'cat_travel', name: 'Travel', color: '#06b6d4', kind: 'expense', sortOrder: 9, isDefault: true },
  { id: INCOME_ID, name: 'Income', color: '#10b981', kind: 'income', sortOrder: 10, isDefault: true },
  { id: TRANSFERS_ID, name: 'Transfers', color: '#64748b', kind: 'transfer', sortOrder: 11, isDefault: true },
  { id: UNCATEGORIZED_ID, name: 'Other', color: '#94a3b8', kind: 'expense', sortOrder: 12, isDefault: true },
];

export const CATEGORY_PALETTE = [
  '#22c55e', '#f97316', '#3b82f6', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6', '#a855f7',
  '#ef4444', '#06b6d4', '#10b981', '#64748b', '#f43f5e', '#84cc16', '#0ea5e9', '#d946ef',
];
