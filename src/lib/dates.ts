import type { ISODate } from '../types';

/**
 * Supported date formats. Tokens: DD, MM, YYYY, YY, MMM (short month name), MMMM (long).
 */
export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'DD.MM.YYYY',
  'YYYY/MM/DD',
  'DD/MM/YY',
  'MM/DD/YY',
  'DD MMM YYYY',
  'MMM DD YYYY',
  'DD-MMM-YYYY',
  'YYYYMMDD',
] as const;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthFromName(name: string): number | null {
  const idx = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return idx === -1 ? null : idx + 1;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidYMD(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) && y >= 1900 && y <= 2200;
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

function escapeLiteral(s: string): string {
  // Any run of separators ("/", "-", ".", " ", ",") is accepted interchangeably
  return s
    .split('')
    .map((ch) => (/[\s/.,-]/.test(ch) ? '[\\s/.,-]+' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
}

/** Build a regex + token list from a format string such as "DD/MM/YYYY". */
function compileFormat(format: string): { re: RegExp; tokens: string[] } {
  const tokens: string[] = [];
  let pattern = '^\\s*';
  const tokenRe = /YYYY|YY|MMMM|MMM|MM|DD/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const fixedWidth = !/[^A-Z]/.test(format); // e.g. YYYYMMDD: no separators => fixed digit widths
  while ((m = tokenRe.exec(format))) {
    pattern += escapeLiteral(format.slice(last, m.index));
    const t = m[0];
    tokens.push(t);
    switch (t) {
      case 'YYYY':
        pattern += '(\\d{4})';
        break;
      case 'YY':
        pattern += '(\\d{2})';
        break;
      case 'MM':
      case 'DD':
        pattern += fixedWidth ? '(\\d{2})' : '(\\d{1,2})';
        break;
      case 'MMM':
      case 'MMMM':
        pattern += '([A-Za-z]{3,9})\\.?';
        break;
    }
    last = m.index + t.length;
  }
  pattern += escapeLiteral(format.slice(last));
  // Allow a trailing time component e.g. "2024-01-05 13:22:01" or "T13:22"
  pattern += '(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\.\\d+)?Z?)?\\s*$';
  return { re: new RegExp(pattern, 'i'), tokens };
}

const formatCache = new Map<string, { re: RegExp; tokens: string[] }>();

/**
 * Parse a date string using the given format. Returns an ISO "YYYY-MM-DD" or null.
 */
export function parseDate(raw: string | null | undefined, format: string): ISODate | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s === '') return null;
  let compiled = formatCache.get(format);
  if (!compiled) {
    compiled = compileFormat(format);
    formatCache.set(format, compiled);
  }
  const m = compiled.re.exec(s);
  if (!m) return null;
  let y = 0;
  let mo = 0;
  let d = 0;
  compiled.tokens.forEach((t, i) => {
    const v = m[i + 1];
    switch (t) {
      case 'YYYY':
        y = parseInt(v, 10);
        break;
      case 'YY': {
        const yy = parseInt(v, 10);
        y = yy >= 70 ? 1900 + yy : 2000 + yy;
        break;
      }
      case 'MM':
        mo = parseInt(v, 10);
        break;
      case 'DD':
        d = parseInt(v, 10);
        break;
      case 'MMM':
      case 'MMMM': {
        const mm = monthFromName(v);
        mo = mm ?? 0;
        break;
      }
    }
  });
  if (!isValidYMD(y, mo, d)) return null;
  return toISO(y, mo, d);
}

export interface DateDetection {
  /** Formats that parse every non-empty sample, best first */
  candidates: string[];
  /** The recommended format (first candidate) or null when nothing fits */
  format: string | null;
  /** True when more than one candidate fits and they disagree on day/month */
  ambiguous: boolean;
}

/**
 * Detect which date format fits a set of sample values. If several formats fit
 * and produce different dates (e.g. every day <= 12), the result is marked
 * ambiguous so the UI can ask the user to confirm.
 */
export function detectDateFormat(samples: string[]): DateDetection {
  const values = samples.map((s) => (s ?? '').trim()).filter((s) => s !== '');
  if (values.length === 0) return { candidates: [], format: null, ambiguous: false };

  const fitting: string[] = [];
  for (const fmt of DATE_FORMATS) {
    if (values.every((v) => parseDate(v, fmt) !== null)) fitting.push(fmt);
  }
  if (fitting.length === 0) return { candidates: [], format: null, ambiguous: false };

  const results = fitting.map((fmt) => values.map((v) => parseDate(v, fmt)));
  let ambiguous = false;
  for (let i = 1; i < results.length; i++) {
    if (results[i].some((r, j) => r !== results[0][j])) {
      ambiguous = true;
      break;
    }
  }
  // Preference order is the order of DATE_FORMATS: ISO first, then DD/MM, then MM/DD
  return { candidates: fitting, format: fitting[0], ambiguous };
}

/** Add days to an ISO date */
export function addDays(iso: ISODate, days: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Add months to an ISO date, clamping the day to the month length */
export function addMonths(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return toISO(ny, nm, nd);
}

/** Whole days between two ISO dates (b - a) */
export function daysBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "YYYY-MM" key for a calendar month */
export function calendarMonthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

/**
 * Month key honoring a custom "first day of month" (e.g. payday on the 25th).
 * A date on or after the first day belongs to that month; earlier dates belong
 * to the previous one. The key is the calendar month in which the period starts.
 */
export function monthKeyFor(iso: ISODate, firstDayOfMonth = 1): string {
  if (firstDayOfMonth <= 1) return calendarMonthKey(iso);
  const [y, m, d] = iso.split('-').map(Number);
  if (d >= firstDayOfMonth) return `${y}-${m.toString().padStart(2, '0')}`;
  return addMonths(toISO(y, m, 1), -1).slice(0, 7);
}

/** Inclusive date range for a month key, honoring a custom first day of month */
export function monthRange(monthKey: string, firstDayOfMonth = 1): { start: ISODate; end: ISODate } {
  const [y, m] = monthKey.split('-').map(Number);
  const fd = Math.max(1, Math.min(28, firstDayOfMonth));
  const start = toISO(y, m, fd);
  const end = addDays(addMonths(start, 1), -1);
  return { start, end };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human label for a month key, e.g. "Mar 2024" */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Short label, e.g. "Mar" (with year when January) */
export function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 1 ? `${MONTH_NAMES[0]} ${y.toString().slice(2)}` : MONTH_NAMES[m - 1];
}

/** Shift a month key by n months */
export function shiftMonthKey(monthKey: string, n: number): string {
  return addMonths(`${monthKey}-01`, n).slice(0, 7);
}

/** List of month keys from a to b inclusive */
export function monthKeysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  let k = a;
  while (k <= b) {
    out.push(k);
    k = shiftMonthKey(k, 1);
  }
  return out;
}

export function formatDateLong(iso: ISODate): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** Start of the week containing `iso`, honoring the first day of week (0 = Sunday) */
export function startOfWeek(iso: ISODate, firstDayOfWeek = 1): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const diff = (dow - firstDayOfWeek + 7) % 7;
  return addDays(iso, -diff);
}
