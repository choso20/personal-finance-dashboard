import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  detectDateFormat,
  monthKeyFor,
  monthKeysBetween,
  monthRange,
  parseDate,
  startOfWeek,
} from './dates';

describe('parseDate', () => {
  it('parses ISO dates', () => {
    expect(parseDate('2024-03-05', 'YYYY-MM-DD')).toBe('2024-03-05');
    expect(parseDate('2024-03-05T10:11:12Z', 'YYYY-MM-DD')).toBe('2024-03-05');
    expect(parseDate('2024-03-05 10:11', 'YYYY-MM-DD')).toBe('2024-03-05');
  });
  it('parses DD/MM/YYYY and MM/DD/YYYY differently', () => {
    expect(parseDate('05/03/2024', 'DD/MM/YYYY')).toBe('2024-03-05');
    expect(parseDate('05/03/2024', 'MM/DD/YYYY')).toBe('2024-05-03');
    expect(parseDate('5/3/2024', 'DD/MM/YYYY')).toBe('2024-03-05');
  });
  it('parses two-digit years', () => {
    expect(parseDate('05/03/24', 'DD/MM/YY')).toBe('2024-03-05');
    expect(parseDate('05/03/99', 'DD/MM/YY')).toBe('1999-03-05');
  });
  it('parses month names', () => {
    expect(parseDate('05 Mar 2024', 'DD MMM YYYY')).toBe('2024-03-05');
    expect(parseDate('5 March 2024', 'DD MMM YYYY')).toBe('2024-03-05');
    expect(parseDate('Mar 5, 2024', 'MMM DD YYYY')).toBe('2024-03-05');
    expect(parseDate('05-Mar-2024', 'DD-MMM-YYYY')).toBe('2024-03-05');
  });
  it('parses compact YYYYMMDD', () => {
    expect(parseDate('20240305', 'YYYYMMDD')).toBe('2024-03-05');
  });
  it('rejects invalid dates', () => {
    expect(parseDate('31/02/2024', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('13/13/2024', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('hello', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('2024-03-05', 'DD/MM/YYYY')).toBeNull();
  });
  it('handles leap years', () => {
    expect(parseDate('29/02/2024', 'DD/MM/YYYY')).toBe('2024-02-29');
    expect(parseDate('29/02/2023', 'DD/MM/YYYY')).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('detects ISO unambiguously', () => {
    const r = detectDateFormat(['2024-01-05', '2024-02-10']);
    expect(r.format).toBe('YYYY-MM-DD');
    expect(r.ambiguous).toBe(false);
  });
  it('detects DD/MM/YYYY when a day > 12 disambiguates', () => {
    const r = detectDateFormat(['05/01/2024', '25/01/2024']);
    expect(r.format).toBe('DD/MM/YYYY');
    expect(r.candidates).not.toContain('MM/DD/YYYY');
    expect(r.ambiguous).toBe(false);
  });
  it('detects MM/DD/YYYY when a month position > 12 disambiguates', () => {
    const r = detectDateFormat(['01/25/2024', '02/03/2024']);
    expect(r.format).toBe('MM/DD/YYYY');
    expect(r.ambiguous).toBe(false);
  });
  it('flags ambiguous when every sample could be either', () => {
    const r = detectDateFormat(['05/01/2024', '03/02/2024']);
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toContain('DD/MM/YYYY');
    expect(r.candidates).toContain('MM/DD/YYYY');
    expect(r.format).toBe('DD/MM/YYYY'); // default preference
  });
  it('is not ambiguous when candidates agree (e.g. 01/01)', () => {
    const r = detectDateFormat(['01/01/2024']);
    expect(r.ambiguous).toBe(false);
  });
  it('detects month-name formats', () => {
    expect(detectDateFormat(['05 Mar 2024', '12 Apr 2024']).format).toBe('DD MMM YYYY');
  });
  it('returns null when nothing fits', () => {
    const r = detectDateFormat(['not a date']);
    expect(r.format).toBeNull();
    expect(r.candidates).toEqual([]);
  });
  it('ignores blank samples', () => {
    expect(detectDateFormat(['', '2024-01-01', '  ']).format).toBe('YYYY-MM-DD');
  });
});

describe('date arithmetic', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });
  it('adds months with clamping', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-12-15', 1)).toBe('2025-01-15');
    expect(addMonths('2024-01-15', -1)).toBe('2023-12-15');
  });
  it('computes days between', () => {
    expect(daysBetween('2024-01-01', '2024-01-31')).toBe(30);
    expect(daysBetween('2024-01-31', '2024-01-01')).toBe(-30);
  });
  it('computes week start', () => {
    expect(startOfWeek('2024-03-06', 1)).toBe('2024-03-04'); // Wed -> Mon
    expect(startOfWeek('2024-03-06', 0)).toBe('2024-03-03'); // Wed -> Sun
  });
});

describe('custom first day of month', () => {
  it('uses calendar months by default', () => {
    expect(monthKeyFor('2024-03-05')).toBe('2024-03');
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });
  it('assigns dates before the first day to the previous month', () => {
    expect(monthKeyFor('2024-03-24', 25)).toBe('2024-02');
    expect(monthKeyFor('2024-03-25', 25)).toBe('2024-03');
    expect(monthKeyFor('2024-01-10', 25)).toBe('2023-12');
  });
  it('computes period ranges for a custom first day', () => {
    expect(monthRange('2024-02', 25)).toEqual({ start: '2024-02-25', end: '2024-03-24' });
  });
  it('lists month keys', () => {
    expect(monthKeysBetween('2023-11', '2024-02')).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
  });
});
