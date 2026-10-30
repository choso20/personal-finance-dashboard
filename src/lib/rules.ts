import type { Rule, RuleCondition, Transaction } from '../types';

const regexCache = new Map<string, RegExp | null>();

function getRegex(pattern: string, caseSensitive: boolean): RegExp | null {
  const key = `${caseSensitive ? 'c' : 'i'}:${pattern}`;
  if (regexCache.has(key)) return regexCache.get(key)!;
  let re: RegExp | null;
  try {
    re = new RegExp(pattern, caseSensitive ? '' : 'i');
  } catch {
    re = null;
  }
  regexCache.set(key, re);
  return re;
}

/** Does a single condition hold for a transaction? */
export function conditionMatches(cond: RuleCondition, tx: Pick<Transaction, 'description' | 'amount' | 'account'>): boolean {
  switch (cond.type) {
    case 'description': {
      const cs = cond.caseSensitive ?? false;
      const hay = cs ? tx.description : tx.description.toLowerCase();
      const needle = cs ? cond.value : cond.value.toLowerCase();
      if (needle === '' && cond.op !== 'regex') return false;
      switch (cond.op) {
        case 'contains':
          return hay.includes(needle);
        case 'equals':
          return hay.trim() === needle.trim();
        case 'startsWith':
          return hay.trimStart().startsWith(needle);
        case 'regex': {
          const re = getRegex(cond.value, cs);
          return re ? re.test(tx.description) : false;
        }
      }
      return false;
    }
    case 'amountRange': {
      const abs = Math.abs(tx.amount);
      if (cond.min !== undefined && abs < cond.min) return false;
      if (cond.max !== undefined && abs > cond.max) return false;
      return true;
    }
    case 'amountSign':
      return cond.sign === 'debit' ? tx.amount < 0 : tx.amount > 0;
    case 'account':
      return tx.account.trim().toLowerCase() === cond.value.trim().toLowerCase();
  }
}

/** All conditions must hold (AND). A rule with no conditions never matches. */
export function ruleMatches(rule: Rule, tx: Pick<Transaction, 'description' | 'amount' | 'account'>): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.conditions.every((c) => conditionMatches(c, tx));
}

/** Rules sorted by priority ascending (lower runs first), disabled rules removed */
export function sortRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => r.enabled).slice().sort((a, b) => a.priority - b.priority);
}

/** First matching rule in priority order, or null */
export function findMatchingRule(sortedRules: Rule[], tx: Pick<Transaction, 'description' | 'amount' | 'account'>): Rule | null {
  for (const r of sortedRules) if (ruleMatches(r, tx)) return r;
  return null;
}

export interface ApplyResult {
  /** Transactions whose category or merchant changed, with the new values */
  updated: Transaction[];
  matchedCount: number;
}

/**
 * Apply rules to transactions. Manual categorizations are never overwritten.
 * Transactions with no matching rule are left unchanged (they keep whatever
 * category they have) unless `resetUnmatchedTo` is given.
 */
export function applyRules(
  rules: Rule[],
  transactions: Transaction[],
  opts: { resetUnmatchedTo?: string } = {},
): ApplyResult {
  const sorted = sortRules(rules);
  const updated: Transaction[] = [];
  let matchedCount = 0;
  for (const tx of transactions) {
    if (tx.isManual) continue;
    const rule = findMatchingRule(sorted, tx);
    if (rule) {
      matchedCount++;
      const next: Transaction = {
        ...tx,
        categoryId: rule.action.categoryId,
        merchant: rule.action.merchantName?.trim() ? rule.action.merchantName.trim() : tx.merchant,
      };
      if (next.categoryId !== tx.categoryId || next.merchant !== tx.merchant) updated.push(next);
    } else if (opts.resetUnmatchedTo && tx.categoryId !== opts.resetUnmatchedTo) {
      updated.push({ ...tx, categoryId: opts.resetUnmatchedTo });
    }
  }
  return { updated, matchedCount };
}

/** How many transactions a (possibly unsaved) rule would match on its own */
export function countMatches(rule: Rule, transactions: Pick<Transaction, 'description' | 'amount' | 'account'>[]): number {
  let n = 0;
  for (const tx of transactions) if (ruleMatches(rule, tx)) n++;
  return n;
}

/**
 * Given rules in the user's desired display order, return copies with
 * priorities renumbered 0..n-1 so that order is persisted.
 */
export function renumberPriorities(orderedRules: Rule[]): Rule[] {
  return orderedRules.map((r, i) => (r.priority === i ? r : { ...r, priority: i }));
}

/** Move an item within an array (used for drag-and-drop reordering) */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Validate a regex pattern; returns an error message or null */
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid regular expression';
  }
}
