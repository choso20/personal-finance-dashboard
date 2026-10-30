import Papa from 'papaparse';
import type { ColumnMapping, ISODate, Minor, Transaction } from '../types';
import { detectDateFormat, parseDate } from './dates';
import { transactionHash } from './hash';
import { parseAmount } from './money';
import { displayMerchant, normalizeDescription } from './normalize';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** Non-fatal parser messages */
  warnings: string[];
}

/**
 * Parse raw CSV text into headers + rows. Strips a UTF-8 BOM, drops fully
 * blank rows (common trailing rows), and pads short rows to the header width.
 */
export function parseCsvText(text: string): ParsedCsv {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const result = Papa.parse<string[]>(t, {
    skipEmptyLines: 'greedy',
    header: false,
    dynamicTyping: false,
  });
  const warnings = result.errors.filter((e) => e.code !== 'UndetectableDelimiter').map((e) => `Row ${e.row ?? '?'}: ${e.message}`);
  const data = result.data.filter((r) => r.some((c) => (c ?? '').trim() !== ''));
  if (data.length === 0) return { headers: [], rows: [], warnings };
  const headers = data[0].map((h, i) => {
    const name = (h ?? '').trim();
    return name === '' ? `Column ${i + 1}` : name;
  });
  const width = headers.length;
  const rows = data.slice(1).map((r) => {
    const row = r.map((c) => (c ?? '').toString());
    while (row.length < width) row.push('');
    return row.slice(0, Math.max(width, row.length));
  });
  return { headers, rows, warnings };
}

/** Stable signature of a header row, used to suggest a saved bank profile */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

const HEADER_HINTS: Record<keyof Omit<ColumnMapping, 'amountMode' | 'invertSign' | 'dateFormat' | 'defaultAccount'>, RegExp[]> = {
  date: [/^(transaction |posting |value |booking )?date$/i, /date/i, /^when$/i],
  description: [/^(description|details|narrative|memo|payee|merchant|name|reference|transaction description|transaction details)$/i, /descr/i, /detail/i, /narrat/i, /memo/i, /payee/i, /merchant/i, /particular/i],
  amount: [/^(amount|value|transaction amount|net)$/i, /amount/i],
  debit: [/^(debit|debit amount|money out|paid out|withdrawal|withdrawals|out|spent|outflow)$/i, /debit/i, /money ?out/i, /paid ?out/i, /withdraw/i, /outflow/i],
  credit: [/^(credit|credit amount|money in|paid in|deposit|deposits|in|received|inflow)$/i, /credit/i, /money ?in/i, /paid ?in/i, /deposit/i, /inflow/i],
  balance: [/^(balance|running balance|closing balance)$/i, /balance/i],
  account: [/^(account|account name|account number|acct)$/i, /account/i],
};

function findHeader(headers: string[], patterns: RegExp[], exclude: Set<string>): string | undefined {
  for (const p of patterns) {
    const h = headers.find((h) => !exclude.has(h) && p.test(h.trim()));
    if (h) return h;
  }
  return undefined;
}

/**
 * Guess a column mapping from header names and sample rows.
 * Returns a complete mapping with best-effort defaults; the user can override.
 */
export function guessMapping(headers: string[], rows: string[][]): ColumnMapping {
  const used = new Set<string>();
  const pick = (key: keyof typeof HEADER_HINTS) => {
    const h = findHeader(headers, HEADER_HINTS[key], used);
    if (h) used.add(h);
    return h;
  };
  const date = pick('date') ?? headers[0] ?? '';
  const description = pick('description') ?? headers.find((h) => !used.has(h)) ?? '';
  const debit = pick('debit');
  const credit = pick('credit');
  const amount = pick('amount');
  const balance = pick('balance');
  const account = pick('account');

  const amountMode = debit && credit && !amount ? 'split' : amount ? 'single' : debit && credit ? 'split' : 'single';
  const dateIdx = headers.indexOf(date);
  const samples = dateIdx >= 0 ? rows.slice(0, 50).map((r) => r[dateIdx] ?? '') : [];
  const detection = detectDateFormat(samples);

  return {
    date,
    description,
    amountMode,
    amount: amount ?? (amountMode === 'single' ? headers.find((h) => !used.has(h) && h !== date && h !== description) : undefined),
    debit,
    credit,
    balance,
    account,
    invertSign: false,
    dateFormat: detection.format ?? 'DD/MM/YYYY',
    defaultAccount: 'Main',
  };
}

export interface ParsedRow {
  rowIndex: number; // 0-based index within `rows` (excludes header)
  date: ISODate;
  description: string;
  amount: Minor;
  balance?: Minor;
  account: string;
}

export interface RowError {
  rowIndex: number;
  message: string;
  raw: string[];
}

export interface ConversionResult {
  rows: ParsedRow[];
  errors: RowError[];
}

/**
 * Apply a column mapping to raw CSV rows, producing normalized parsed rows.
 * Rows that fail to parse are reported in `errors`, never thrown.
 */
export function convertRows(headers: string[], rows: string[][], mapping: ColumnMapping): ConversionResult {
  const idx = (name?: string) => (name ? headers.indexOf(name) : -1);
  const iDate = idx(mapping.date);
  const iDesc = idx(mapping.description);
  const iAmount = idx(mapping.amount);
  const iDebit = idx(mapping.debit);
  const iCredit = idx(mapping.credit);
  const iBalance = idx(mapping.balance);
  const iAccount = idx(mapping.account);

  const out: ParsedRow[] = [];
  const errors: RowError[] = [];

  rows.forEach((row, rowIndex) => {
    const get = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
    const dateRaw = get(iDate);
    const date = parseDate(dateRaw, mapping.dateFormat);
    if (!date) {
      errors.push({ rowIndex, message: `Could not parse date "${dateRaw}" as ${mapping.dateFormat}`, raw: row });
      return;
    }
    let amount: Minor | null = null;
    if (mapping.amountMode === 'split') {
      const debitRaw = get(iDebit);
      const creditRaw = get(iCredit);
      const debit = parseAmount(debitRaw);
      const credit = parseAmount(creditRaw);
      if (debit === null && credit === null) {
        errors.push({ rowIndex, message: 'Neither debit nor credit has a value', raw: row });
        return;
      }
      // Debit columns are usually positive numbers meaning money out; some banks already sign them.
      const d = debit === null ? 0 : -Math.abs(debit);
      const c = credit === null ? 0 : Math.abs(credit);
      amount = d + c;
    } else {
      const raw = get(iAmount);
      amount = parseAmount(raw);
      if (amount === null) {
        errors.push({ rowIndex, message: `Could not parse amount "${raw}"`, raw: row });
        return;
      }
    }
    if (mapping.invertSign) amount = -amount;
    const description = get(iDesc);
    const balanceRaw = get(iBalance);
    const balance = balanceRaw ? (parseAmount(balanceRaw) ?? undefined) : undefined;
    const account = (iAccount >= 0 ? get(iAccount) : '') || mapping.defaultAccount || 'Main';
    out.push({ rowIndex, date, description, amount, balance, account });
  });

  return { rows: out, errors };
}

export interface ImportPlan {
  newTransactions: Transaction[];
  duplicateCount: number;
}

/**
 * Turn parsed rows into Transaction records, computing dedup hashes and
 * skipping any that already exist. Identical rows within the same file get an
 * ordinal so that two genuinely separate identical purchases both import, but
 * re-importing the same file produces 100% duplicates.
 */
export function planImport(
  rows: ParsedRow[],
  existingHashes: Set<string>,
  opts: { batchId: string; defaultCategoryId: string; now?: number; idFactory: () => string },
): ImportPlan {
  const seenInFile = new Map<string, number>();
  const newTransactions: Transaction[] = [];
  let duplicateCount = 0;
  const now = opts.now ?? Date.now();

  for (const r of rows) {
    const baseKey = transactionHash({ date: r.date, amount: r.amount, description: r.description, account: r.account });
    const ordinal = seenInFile.get(baseKey) ?? 0;
    seenInFile.set(baseKey, ordinal + 1);
    const hash = ordinal === 0 ? baseKey : transactionHash({ date: r.date, amount: r.amount, description: r.description, account: r.account, ordinal });
    if (existingHashes.has(hash)) {
      duplicateCount++;
      continue;
    }
    existingHashes.add(hash);
    newTransactions.push({
      id: opts.idFactory(),
      hash,
      date: r.date,
      description: r.description,
      normalizedDescription: normalizeDescription(r.description),
      merchant: displayMerchant(r.description),
      amount: r.amount,
      balance: r.balance,
      account: r.account,
      categoryId: opts.defaultCategoryId,
      isManual: false,
      notes: '',
      excluded: false,
      importedAt: now,
      importBatchId: opts.batchId,
    });
  }
  return { newTransactions, duplicateCount };
}

/** Serialize transactions to CSV text for export */
export function transactionsToCsv(
  txs: Transaction[],
  categoryName: (id: string) => string,
): string {
  const rows = txs.map((t) => ({
    Date: t.date,
    Description: t.description,
    Merchant: t.merchant,
    Amount: (t.amount / 100).toFixed(2),
    Category: categoryName(t.categoryId),
    Account: t.account,
    Notes: t.notes,
    Excluded: t.excluded ? 'yes' : '',
    Balance: t.balance === undefined ? '' : (t.balance / 100).toFixed(2),
  }));
  return Papa.unparse(rows, { newline: '\n' });
}
