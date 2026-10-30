import { describe, expect, it } from 'vitest';
import type { Rule, Transaction } from '../types';
import { applyRules, conditionMatches, countMatches, findMatchingRule, moveItem, renumberPriorities, ruleMatches, sortRules } from './rules';
import { buildStarterRules } from './starterRules';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    hash: 'h',
    date: '2024-01-01',
    description: 'TESCO STORES 1234',
    normalizedDescription: 'tesco stores',
    merchant: 'Tesco Stores',
    amount: -1000,
    account: 'Current',
    categoryId: 'cat_other',
    isManual: false,
    notes: '',
    excluded: false,
    importedAt: 0,
    importBatchId: 'b',
    ...partial,
  };
}

function rule(partial: Partial<Rule>): Rule {
  return {
    id: 'r',
    name: 'r',
    priority: 0,
    enabled: true,
    conditions: [{ type: 'description', op: 'contains', value: 'tesco' }],
    action: { categoryId: 'cat_groceries' },
    ...partial,
  };
}

describe('conditionMatches', () => {
  const t = tx({});
  it('description ops are case-insensitive by default', () => {
    expect(conditionMatches({ type: 'description', op: 'contains', value: 'tesco' }, t)).toBe(true);
    expect(conditionMatches({ type: 'description', op: 'contains', value: 'TESCO', caseSensitive: true }, t)).toBe(true);
    expect(conditionMatches({ type: 'description', op: 'contains', value: 'tesco', caseSensitive: true }, t)).toBe(false);
    expect(conditionMatches({ type: 'description', op: 'equals', value: 'tesco stores 1234' }, t)).toBe(true);
    expect(conditionMatches({ type: 'description', op: 'equals', value: 'tesco' }, t)).toBe(false);
    expect(conditionMatches({ type: 'description', op: 'startsWith', value: 'tesco' }, t)).toBe(true);
    expect(conditionMatches({ type: 'description', op: 'startsWith', value: 'stores' }, t)).toBe(false);
  });
  it('regex works and bad regexes never match', () => {
    expect(conditionMatches({ type: 'description', op: 'regex', value: '^tesco\\s+stores\\s+\\d+$' }, t)).toBe(true);
    expect(conditionMatches({ type: 'description', op: 'regex', value: '[' }, t)).toBe(false);
  });
  it('empty contains value never matches', () => {
    expect(conditionMatches({ type: 'description', op: 'contains', value: '' }, t)).toBe(false);
  });
  it('amount range compares absolute values', () => {
    expect(conditionMatches({ type: 'amountRange', min: 500, max: 1500 }, t)).toBe(true);
    expect(conditionMatches({ type: 'amountRange', min: 1001 }, t)).toBe(false);
    expect(conditionMatches({ type: 'amountRange', max: 999 }, t)).toBe(false);
  });
  it('amount sign', () => {
    expect(conditionMatches({ type: 'amountSign', sign: 'debit' }, t)).toBe(true);
    expect(conditionMatches({ type: 'amountSign', sign: 'credit' }, t)).toBe(false);
    expect(conditionMatches({ type: 'amountSign', sign: 'credit' }, tx({ amount: 5 }))).toBe(true);
  });
  it('account is case-insensitive', () => {
    expect(conditionMatches({ type: 'account', value: 'current' }, t)).toBe(true);
    expect(conditionMatches({ type: 'account', value: 'Savings' }, t)).toBe(false);
  });
});

describe('ruleMatches / findMatchingRule', () => {
  it('requires all conditions', () => {
    const r = rule({ conditions: [{ type: 'description', op: 'contains', value: 'tesco' }, { type: 'amountSign', sign: 'credit' }] });
    expect(ruleMatches(r, tx({}))).toBe(false);
    expect(ruleMatches(r, tx({ amount: 100 }))).toBe(true);
  });
  it('a rule with no conditions never matches', () => {
    expect(ruleMatches(rule({ conditions: [] }), tx({}))).toBe(false);
  });
  it('first match in priority order wins and disabled rules are skipped', () => {
    const rules = [
      rule({ id: 'b', priority: 2, action: { categoryId: 'B' } }),
      rule({ id: 'a', priority: 1, action: { categoryId: 'A' } }),
      rule({ id: 'off', priority: 0, enabled: false, action: { categoryId: 'OFF' } }),
    ];
    const sorted = sortRules(rules);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b']);
    expect(findMatchingRule(sorted, tx({}))?.action.categoryId).toBe('A');
    expect(findMatchingRule(sorted, tx({ description: 'ZZZ' }))).toBeNull();
  });
});

describe('applyRules', () => {
  it('sets category and merchant for matches, leaves manual edits alone', () => {
    const rules = [rule({ action: { categoryId: 'cat_groceries', merchantName: 'Tesco' } })];
    const txs = [tx({ id: '1' }), tx({ id: '2', isManual: true, categoryId: 'cat_dining' }), tx({ id: '3', description: 'NOTHING' })];
    const res = applyRules(rules, txs);
    expect(res.matchedCount).toBe(1);
    expect(res.updated).toHaveLength(1);
    expect(res.updated[0].id).toBe('1');
    expect(res.updated[0].categoryId).toBe('cat_groceries');
    expect(res.updated[0].merchant).toBe('Tesco');
  });
  it('does not report unchanged transactions', () => {
    const rules = [rule({ action: { categoryId: 'cat_groceries' } })];
    const res = applyRules(rules, [tx({ categoryId: 'cat_groceries' })]);
    expect(res.matchedCount).toBe(1);
    expect(res.updated).toHaveLength(0);
  });
  it('can reset unmatched, non-manual transactions', () => {
    const rules = [rule({})];
    const res = applyRules(rules, [tx({ id: 'u', description: 'ZZZ', categoryId: 'cat_dining' })], { resetUnmatchedTo: 'cat_other' });
    expect(res.updated[0].categoryId).toBe('cat_other');
  });
});

describe('helpers', () => {
  it('countMatches', () => {
    expect(countMatches(rule({}), [tx({}), tx({ description: 'x' }), tx({})])).toBe(2);
  });
  it('moveItem and renumberPriorities', () => {
    const rules = [rule({ id: 'a', priority: 0 }), rule({ id: 'b', priority: 1 }), rule({ id: 'c', priority: 2 })];
    const moved = moveItem(rules, 2, 0);
    expect(moved.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    const renum = renumberPriorities(moved);
    expect(renum.map((r) => r.priority)).toEqual([0, 1, 2]);
    expect(renum[0].id).toBe('c');
  });
});

describe('starter rules', () => {
  const rules = sortRules(buildStarterRules());
  it('have unique ids', () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });
  it('categorize common merchants', () => {
    expect(findMatchingRule(rules, tx({ description: 'NETFLIX.COM' }))?.action.categoryId).toBe('cat_subscriptions');
    expect(findMatchingRule(rules, tx({ description: 'UBER *TRIP HELP.UBER.COM' }))?.action.categoryId).toBe('cat_transport');
    expect(findMatchingRule(rules, tx({ description: 'SAINSBURYS S/MKT 1234' }))?.action.categoryId).toBe('cat_groceries');
    expect(findMatchingRule(rules, tx({ description: 'ACME LTD SALARY', amount: 250000 }))?.action.categoryId).toBe('cat_income');
    // "salary" is only income when money comes in
    expect(findMatchingRule(rules, tx({ description: 'ACME LTD SALARY', amount: -250000 }))?.action.categoryId).not.toBe('cat_income');
  });
  it('prefer Uber Eats over Uber', () => {
    expect(findMatchingRule(rules, tx({ description: 'UBER *EATS' }))?.action.categoryId).toBe('cat_dining');
  });
});
