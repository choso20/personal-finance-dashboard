/**
 * Core data model. All money values are integers in minor units (pence/cents).
 * Dates are ISO calendar strings "YYYY-MM-DD" unless noted.
 */

export type ISODate = string; // "YYYY-MM-DD"
export type Minor = number; // integer minor units

export interface Transaction {
  id: string;
  /** Dedup hash: date + amount + normalized description + account */
  hash: string;
  date: ISODate;
  /** Raw description from the bank CSV */
  description: string;
  /** Lower-cased, punctuation/number-stripped version used for matching and grouping */
  normalizedDescription: string;
  /** Clean display name (from a rule's rename action, or derived from the description) */
  merchant: string;
  /** Signed amount in minor units. Negative = money out, positive = money in. */
  amount: Minor;
  balance?: Minor;
  account: string;
  categoryId: string;
  /** Set when the user edited the category by hand; rules never overwrite it */
  isManual: boolean;
  notes: string;
  /** Excluded from reports (e.g. transfers between own accounts) */
  excluded: boolean;
  importedAt: number; // epoch ms
  importBatchId: string;
}

export interface Category {
  id: string;
  name: string;
  color: string; // hex
  /** Income / transfer categories are treated specially in reports */
  kind: 'expense' | 'income' | 'transfer';
  sortOrder: number;
  isDefault?: boolean;
}

export type DescriptionOp = 'contains' | 'equals' | 'startsWith' | 'regex';

export type RuleCondition =
  | { type: 'description'; op: DescriptionOp; value: string; caseSensitive?: boolean }
  | { type: 'amountRange'; min?: Minor; max?: Minor } // compared on absolute value
  | { type: 'amountSign'; sign: 'debit' | 'credit' }
  | { type: 'account'; value: string };

export interface Rule {
  id: string;
  name: string;
  /** Lower = evaluated first */
  priority: number;
  enabled: boolean;
  conditions: RuleCondition[];
  action: {
    categoryId: string;
    /** Optional clean merchant display name */
    merchantName?: string;
  };
  isStarter?: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthlyAmount: Minor;
  rollover: boolean;
}

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annual';

export interface SubscriptionDecision {
  /** Merchant key (normalized merchant) */
  key: string;
  status: 'confirmed' | 'dismissed';
  /** Manually-added subscription details (only when the user added it by hand) */
  manual?: {
    merchant: string;
    amount: Minor;
    frequency: SubscriptionFrequency;
    nextDate?: ISODate;
  };
  updatedAt: number;
}

export type AmountMode = 'single' | 'split';

export interface ColumnMapping {
  date: string;
  description: string;
  amountMode: AmountMode;
  amount?: string;
  debit?: string;
  credit?: string;
  balance?: string;
  account?: string;
  invertSign: boolean;
  dateFormat: string;
  /** Used when no account column is mapped */
  defaultAccount: string;
}

export interface BankProfile {
  id: string;
  name: string;
  mapping: ColumnMapping;
  /** Header signature so we can auto-suggest the profile on re-import */
  headerSignature: string;
  createdAt: number;
}

export interface Settings {
  id: 'settings';
  currencySymbol: string;
  /** 0 = Sunday, 1 = Monday */
  firstDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Day of month the budgeting month starts on (1-28) */
  firstDayOfMonth: number;
  theme: 'light' | 'dark' | 'system';
}

export interface ImportBatch {
  id: string;
  createdAt: number;
  fileName: string;
  profileName?: string;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface Backup {
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  categories: Category[];
  rules: Rule[];
  budgets: Budget[];
  bankProfiles: BankProfile[];
  subscriptionDecisions: SubscriptionDecision[];
  settings?: Settings;
}
