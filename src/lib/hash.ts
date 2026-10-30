import type { Minor } from '../types';
import { normalizeDescription } from './normalize';

/** FNV-1a 32-bit hash */
function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Two independent 32-bit FNV hashes concatenated => 16 hex chars */
export function hashString(str: string): string {
  const a = fnv1a(str);
  const b = fnv1a(str, 0x9747b28c);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Deduplication hash for a transaction: date + amount + normalized description + account.
 * Two rows with the same values on the same day are considered the same transaction.
 * To allow legitimately repeated identical rows in one file (e.g. two coffees),
 * the importer appends an `ordinal` when it sees the same hash twice in a file.
 */
export function transactionHash(input: {
  date: string;
  amount: Minor;
  description: string;
  account: string;
  ordinal?: number;
}): string {
  const parts = [
    input.date,
    input.amount.toString(),
    normalizeDescription(input.description),
    (input.account ?? '').trim().toLowerCase(),
  ];
  if (input.ordinal && input.ordinal > 0) parts.push(`#${input.ordinal}`);
  return hashString(parts.join('|'));
}
