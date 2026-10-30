import type { Minor } from '../types';

/**
 * Parse a human-formatted amount string into integer minor units.
 *
 * Handles: currency symbols (£, $, €, etc.), thousands separators,
 * parentheses for negatives, leading/trailing minus, "CR"/"DR" suffixes,
 * European decimal commas ("1.234,56"), and surrounding whitespace.
 *
 * Returns null when the string is empty or not a number.
 */
export function parseAmount(raw: string | number | null | undefined): Minor | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * 100);
  }
  let s = raw.trim();
  if (s === '') return null;

  let negative = false;

  // Parentheses => negative
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Trailing CR/DR markers (common in UK statements)
  const crdr = s.match(/\s*(CR|DR)$/i);
  if (crdr) {
    if (crdr[1].toUpperCase() === 'DR') negative = !negative;
    s = s.slice(0, crdr.index).trim();
  }

  // Leading or trailing minus / plus
  if (/^[-−]/.test(s)) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (/^\+/.test(s)) {
    s = s.slice(1).trim();
  }
  if (/[-−]$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }

  // Strip currency symbols, letters and whitespace (keep digits, separators and sign)
  s = s.replace(/[^\d.,\-−]/g, '');
  // A minus might have been inside (e.g. "£-12.34")
  if (/^[-−]/.test(s)) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s === '' || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  let intPart: string;
  let fracPart: string;

  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal separator
    const decIdx = Math.max(lastDot, lastComma);
    intPart = s.slice(0, decIdx).replace(/[.,]/g, '');
    fracPart = s.slice(decIdx + 1);
  } else if (lastComma >= 0) {
    const commaCount = (s.match(/,/g) ?? []).length;
    const after = s.slice(lastComma + 1);
    if (commaCount === 1 && after.length !== 3) {
      // "12,34" => decimal comma
      intPart = s.slice(0, lastComma);
      fracPart = after;
    } else {
      // "1,234" or "1,234,567" => thousands
      intPart = s.replace(/,/g, '');
      fracPart = '';
    }
  } else if (lastDot >= 0) {
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount === 1) {
      intPart = s.slice(0, lastDot);
      fracPart = s.slice(lastDot + 1);
    } else {
      // "1.234.567" => thousands with dots
      intPart = s.replace(/\./g, '');
      fracPart = '';
    }
  } else {
    intPart = s;
    fracPart = '';
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  const whole = intPart === '' ? 0 : parseInt(intPart, 10);
  let frac = 0;
  if (fracPart !== '') {
    // Round to 2 decimal places using the first 3 digits
    const padded = fracPart.padEnd(3, '0').slice(0, 3);
    frac = Math.round(parseInt(padded, 10) / 10);
  }
  const minor = whole * 100 + frac;
  if (!Number.isFinite(minor)) return null;
  return negative ? -minor : minor;
}

export interface FormatOptions {
  symbol?: string;
  /** Always show sign, including "+" for positive */
  signed?: boolean;
  /** Omit the fractional part when zero */
  compact?: boolean;
}

/** Format integer minor units as a currency string, e.g. 123456 => "£1,234.56" */
export function formatMoney(minor: Minor, opts: FormatOptions = {}): string {
  const { symbol = '£', signed = false, compact = false } = opts;
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let body = compact && frac === 0 ? wholeStr : `${wholeStr}.${frac.toString().padStart(2, '0')}`;
  body = `${symbol}${body}`;
  if (minor < 0) return `-${body}`;
  if (signed && minor > 0) return `+${body}`;
  return body;
}

/** Convert a decimal major-unit number (e.g. from a number input) to minor units */
export function toMinor(major: number): Minor {
  return Math.round(major * 100);
}

/** Convert minor units to a decimal major-unit number for display in inputs */
export function toMajor(minor: Minor): number {
  return minor / 100;
}

export function sum(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Percentage change from a to b (e.g. 12.5), null when a is 0 */
export function pctChange(a: number, b: number): number | null {
  if (a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}
