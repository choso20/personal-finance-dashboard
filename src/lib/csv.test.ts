import { describe, expect, it } from 'vitest';
import { convertRows, guessMapping, headerSignature, parseCsvText, planImport } from './csv';
import type { ColumnMapping } from '../types';

const SIGNED_CSV = `﻿Date,Description,Amount,Balance
05/01/2024,TESCO STORES 3421,-23.45,"1,234.56"
06/01/2024,SALARY ACME LTD,"2,500.00","3,734.56"
25/01/2024,NETFLIX.COM,(9.99),3724.57

`;

const SPLIT_CSV = `Transaction Date,Details,Money Out,Money In,Account
2024-01-05,Tesco Stores,23.45,,Current
2024-01-06,Salary,,2500.00,Current
2024-01-07,Coffee,3.20,,Current
2024-01-07,Coffee,3.20,,Current
`;

describe('parseCsvText', () => {
  it('strips BOM, parses headers and drops trailing blank rows', () => {
    const p = parseCsvText(SIGNED_CSV);
    expect(p.headers).toEqual(['Date', 'Description', 'Amount', 'Balance']);
    expect(p.rows).toHaveLength(3);
    expect(p.rows[1][2]).toBe('2,500.00');
  });
  it('handles empty input', () => {
    expect(parseCsvText('').rows).toEqual([]);
  });
  it('pads short rows', () => {
    const p = parseCsvText('A,B,C\n1,2\n');
    expect(p.rows[0]).toEqual(['1', '2', '']);
  });
});

describe('guessMapping', () => {
  it('guesses a signed-amount layout and DD/MM date format', () => {
    const p = parseCsvText(SIGNED_CSV);
    const m = guessMapping(p.headers, p.rows);
    expect(m.date).toBe('Date');
    expect(m.description).toBe('Description');
    expect(m.amountMode).toBe('single');
    expect(m.amount).toBe('Amount');
    expect(m.balance).toBe('Balance');
    expect(m.dateFormat).toBe('DD/MM/YYYY');
  });
  it('guesses a debit/credit layout and ISO dates', () => {
    const p = parseCsvText(SPLIT_CSV);
    const m = guessMapping(p.headers, p.rows);
    expect(m.date).toBe('Transaction Date');
    expect(m.description).toBe('Details');
    expect(m.amountMode).toBe('split');
    expect(m.debit).toBe('Money Out');
    expect(m.credit).toBe('Money In');
    expect(m.account).toBe('Account');
    expect(m.dateFormat).toBe('YYYY-MM-DD');
  });
  it('produces a signature', () => {
    expect(headerSignature(['Date', ' Money  Out'])).toBe('date|money out');
  });
});

describe('convertRows', () => {
  it('converts signed amounts with symbols, parentheses and thousands', () => {
    const p = parseCsvText(SIGNED_CSV);
    const m = guessMapping(p.headers, p.rows);
    const r = convertRows(p.headers, p.rows, m);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.amount)).toEqual([-2345, 250000, -999]);
    expect(r.rows[0].date).toBe('2024-01-05');
    expect(r.rows[0].balance).toBe(123456);
    expect(r.rows[0].account).toBe('Main');
  });
  it('converts debit/credit columns into signed amounts', () => {
    const p = parseCsvText(SPLIT_CSV);
    const m = guessMapping(p.headers, p.rows);
    const r = convertRows(p.headers, p.rows, m);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.amount)).toEqual([-2345, 250000, -320, -320]);
    expect(r.rows[0].account).toBe('Current');
  });
  it('inverts sign when asked', () => {
    const p = parseCsvText(SIGNED_CSV);
    const m: ColumnMapping = { ...guessMapping(p.headers, p.rows), invertSign: true };
    const r = convertRows(p.headers, p.rows, m);
    expect(r.rows.map((x) => x.amount)).toEqual([2345, -250000, 999]);
  });
  it('reports row errors instead of throwing', () => {
    const p = parseCsvText('Date,Description,Amount\nnot-a-date,X,1.00\n05/01/2024,Y,abc\n05/01/2024,Z,1.00\n');
    const m = guessMapping(p.headers, p.rows);
    m.dateFormat = 'DD/MM/YYYY';
    const r = convertRows(p.headers, p.rows, m);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].message).toMatch(/date/);
    expect(r.errors[1].message).toMatch(/amount/);
  });
  it('treats already-signed debit columns as money out', () => {
    const p = parseCsvText('Date,Details,Debit,Credit\n2024-01-05,Shop,-10.00,\n');
    const m = guessMapping(p.headers, p.rows);
    const r = convertRows(p.headers, p.rows, m);
    expect(r.rows[0].amount).toBe(-1000);
  });
  it('errors when both debit and credit are blank', () => {
    const p = parseCsvText('Date,Details,Debit,Credit\n2024-01-05,Shop,,\n');
    const m = guessMapping(p.headers, p.rows);
    const r = convertRows(p.headers, p.rows, m);
    expect(r.errors).toHaveLength(1);
  });
});

describe('planImport', () => {
  let n = 0;
  const idFactory = () => `id${++n}`;
  const opts = { batchId: 'b1', defaultCategoryId: 'other', now: 1, idFactory };

  it('imports all rows the first time and keeps identical in-file rows', () => {
    const p = parseCsvText(SPLIT_CSV);
    const r = convertRows(p.headers, p.rows, guessMapping(p.headers, p.rows));
    const existing = new Set<string>();
    const plan = planImport(r.rows, existing, opts);
    expect(plan.newTransactions).toHaveLength(4);
    expect(plan.duplicateCount).toBe(0);
    expect(new Set(plan.newTransactions.map((t) => t.hash)).size).toBe(4);
    expect(plan.newTransactions[0].normalizedDescription).toBe('tesco stores');
    expect(plan.newTransactions[0].merchant).toBe('Tesco Stores');
  });

  it('skips everything on re-import of the same file', () => {
    const p = parseCsvText(SPLIT_CSV);
    const r = convertRows(p.headers, p.rows, guessMapping(p.headers, p.rows));
    const existing = new Set<string>();
    planImport(r.rows, existing, opts);
    const again = planImport(r.rows, existing, opts);
    expect(again.newTransactions).toHaveLength(0);
    expect(again.duplicateCount).toBe(4);
  });

  it('imports only new rows from an overlapping export', () => {
    const p = parseCsvText(SPLIT_CSV);
    const r = convertRows(p.headers, p.rows, guessMapping(p.headers, p.rows));
    const existing = new Set<string>();
    planImport(r.rows.slice(0, 2), existing, opts);
    const plan = planImport(r.rows, existing, opts);
    expect(plan.newTransactions).toHaveLength(2);
    expect(plan.duplicateCount).toBe(2);
  });

  it('matches duplicates across different bank formats of the same transaction', () => {
    const a = parseCsvText('Date,Description,Amount\n05/01/2024,TESCO STORES 3421 CARD,-23.45\n');
    const b = parseCsvText('Date,Description,Debit,Credit\n2024-01-05,Tesco Stores 9999,23.45,\n');
    const ra = convertRows(a.headers, a.rows, { ...guessMapping(a.headers, a.rows), dateFormat: 'DD/MM/YYYY' });
    const rb = convertRows(b.headers, b.rows, guessMapping(b.headers, b.rows));
    const existing = new Set<string>();
    planImport(ra.rows, existing, opts);
    const plan = planImport(rb.rows, existing, opts);
    expect(plan.duplicateCount).toBe(1);
  });
});
