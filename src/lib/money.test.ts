import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, pctChange } from './money';

describe('parseAmount', () => {
  it('parses plain decimals into minor units', () => {
    expect(parseAmount('12.34')).toBe(1234);
    expect(parseAmount('0.1')).toBe(10);
    expect(parseAmount('5')).toBe(500);
    expect(parseAmount('.99')).toBe(99);
  });

  it('handles negatives, plus signs and unicode minus', () => {
    expect(parseAmount('-12.34')).toBe(-1234);
    expect(parseAmount('+12.34')).toBe(1234);
    expect(parseAmount('−12.34')).toBe(-1234);
    expect(parseAmount('12.34-')).toBe(-1234);
  });

  it('treats parentheses as negative', () => {
    expect(parseAmount('(12.34)')).toBe(-1234);
    expect(parseAmount('($1,234.56)')).toBe(-123456);
  });

  it('strips currency symbols and whitespace', () => {
    expect(parseAmount('£1,234.56')).toBe(123456);
    expect(parseAmount('$ 99.00')).toBe(9900);
    expect(parseAmount('€-5.50')).toBe(-550);
    expect(parseAmount('  12.00 GBP ')).toBe(1200);
    expect(parseAmount('-£12.00')).toBe(-1200);
  });

  it('handles thousands separators', () => {
    expect(parseAmount('1,234,567.89')).toBe(123456789);
    expect(parseAmount('1,234')).toBe(123400);
  });

  it('handles European decimal commas', () => {
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('12,34')).toBe(1234);
    expect(parseAmount('1.234.567')).toBe(123456700);
  });

  it('handles CR/DR suffixes', () => {
    expect(parseAmount('12.34 CR')).toBe(1234);
    expect(parseAmount('12.34 DR')).toBe(-1234);
    expect(parseAmount('12.34DR')).toBe(-1234);
  });

  it('rounds extra decimal places', () => {
    expect(parseAmount('1.005')).toBe(101);
    expect(parseAmount('1.004')).toBe(100);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('accepts numbers', () => {
    expect(parseAmount(12.34)).toBe(1234);
    expect(parseAmount(0.1 + 0.2)).toBe(30);
  });
});

describe('formatMoney', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatMoney(123456)).toBe('£1,234.56');
    expect(formatMoney(5)).toBe('£0.05');
    expect(formatMoney(0)).toBe('£0.00');
  });
  it('formats negatives and custom symbols', () => {
    expect(formatMoney(-1234, { symbol: '$' })).toBe('-$12.34');
    expect(formatMoney(1234, { signed: true })).toBe('+£12.34');
  });
  it('compact mode drops zero pence', () => {
    expect(formatMoney(120000, { compact: true })).toBe('£1,200');
    expect(formatMoney(120050, { compact: true })).toBe('£1,200.50');
  });
});

describe('pctChange', () => {
  it('computes percentage change', () => {
    expect(pctChange(100, 150)).toBe(50);
    expect(pctChange(200, 100)).toBe(-50);
    expect(pctChange(0, 100)).toBeNull();
  });
});
