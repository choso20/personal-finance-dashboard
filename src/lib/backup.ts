import type { Backup } from '../types';

export const BACKUP_VERSION = 1 as const;

export function createBackup(data: Omit<Backup, 'version' | 'exportedAt'>): Backup {
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...data };
}

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  backup?: Backup;
}

const ARRAY_KEYS: (keyof Backup)[] = ['transactions', 'categories', 'rules', 'budgets', 'bankProfiles', 'subscriptionDecisions'];

/** Validate the shape of a parsed JSON backup without trusting its contents */
export function validateBackup(input: unknown): BackupValidation {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Backup is not a JSON object'] };
  const obj = input as Record<string, unknown>;
  if (obj.version !== BACKUP_VERSION) errors.push(`Unsupported backup version: ${String(obj.version)}`);
  for (const k of ARRAY_KEYS) {
    if (!Array.isArray(obj[k])) errors.push(`Missing or invalid "${k}" array`);
  }
  if (errors.length) return { ok: false, errors };
  const txs = obj.transactions as unknown[];
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i] as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.date !== 'string' || typeof t.amount !== 'number' || !Number.isInteger(t.amount)) {
      errors.push(`Transaction ${i} is malformed`);
      if (errors.length > 5) break;
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], backup: obj as unknown as Backup };
}

export function parseBackup(text: string): BackupValidation {
  try {
    return validateBackup(JSON.parse(text));
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? `Invalid JSON: ${e.message}` : 'Invalid JSON'] };
  }
}
