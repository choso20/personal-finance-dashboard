import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, validateBackup } from './backup';

describe('backup', () => {
  const data = { transactions: [], categories: [], rules: [], budgets: [], bankProfiles: [], subscriptionDecisions: [] };
  it('round-trips', () => {
    const b = createBackup(data);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    expect(r.backup?.version).toBe(1);
  });
  it('rejects invalid json and shapes', () => {
    expect(parseBackup('{').ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ version: 2, ...data }).errors[0]).toMatch(/version/);
    expect(validateBackup({ version: 1 }).errors.length).toBeGreaterThan(0);
  });
  it('rejects malformed transactions', () => {
    const r = validateBackup({ version: 1, ...data, transactions: [{ id: 1 }] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Transaction 0/);
  });
});
