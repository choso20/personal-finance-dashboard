import Dexie, { type EntityTable } from 'dexie';
import type {
  BankProfile,
  Budget,
  Category,
  ImportBatch,
  Rule,
  Settings,
  SubscriptionDecision,
  Transaction,
} from '../types';

export class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  rules!: EntityTable<Rule, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  bankProfiles!: EntityTable<BankProfile, 'id'>;
  subscriptionDecisions!: EntityTable<SubscriptionDecision, 'key'>;
  settings!: EntityTable<Settings, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;

  constructor(name = 'personal-finance') {
    super(name);
    this.version(1).stores({
      transactions: 'id, &hash, date, account, categoryId, normalizedDescription, importBatchId',
      categories: 'id, sortOrder',
      rules: 'id, priority',
      budgets: 'id, &categoryId',
      bankProfiles: 'id, headerSignature',
      subscriptionDecisions: 'key',
      settings: 'id',
      importBatches: 'id, createdAt',
    });
    this.version(2).stores({
      bankProfiles: 'id, headerSignature, createdAt',
    });
  }
}

export const db = new FinanceDB();
