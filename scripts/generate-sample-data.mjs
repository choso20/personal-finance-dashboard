// Generates the sample CSVs in /sample-data. Deterministic (seeded) so re-running
// produces identical files. Run with: node scripts/generate-sample-data.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'sample-data');
mkdirSync(outDir, { recursive: true });

// --- tiny seeded PRNG (mulberry32) ---
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261030);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const money = (lo, hi) => Math.round(between(lo, hi) * 100) / 100;

const START = new Date(Date.UTC(2026, 3, 1)); // 1 Apr 2026
const END = new Date(Date.UTC(2026, 9, 28)); // 28 Oct 2026

function* eachDay() {
  for (let d = new Date(START); d <= END; d.setUTCDate(d.getUTCDate() + 1)) yield new Date(d);
}
const iso = (d) => d.toISOString().slice(0, 10);
const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const mmddyyyy = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
const dateOn = (y, m, day) => new Date(Date.UTC(y, m - 1, day));
const inRange = (d) => d >= START && d <= END;
const drift = (d, days) => {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + Math.round(between(-days, days)));
  return c;
};
const months = [
  [2026, 4],
  [2026, 5],
  [2026, 6],
  [2026, 7],
  [2026, 8],
  [2026, 9],
  [2026, 10],
];

// ---------------------------------------------------------------------------
// File 1: Current account — ISO dates, single signed amount column, running balance
// ---------------------------------------------------------------------------
{
  const rows = []; // {d, desc, amt}
  for (const [y, m] of months) {
    // Salary on the 25th (a bit early if weekend — keep simple)
    rows.push({ d: dateOn(y, m, 25), desc: 'FPS ACME TECHNOLOGIES LTD SALARY', amt: 4250.0 });
    // Monthly contribution to the joint account
    rows.push({ d: dateOn(y, m, 28), desc: 'TRANSFER TO JOINT ACCOUNT 20-45-67', amt: -900.0 });
    // Rent on the 1st
    rows.push({ d: dateOn(y, m, 1), desc: 'STANDING ORDER RENT J SMITH LANDLORD', amt: -1250.0 });
    // Transfer to savings on the 26th
    rows.push({ d: dateOn(y, m, 26), desc: 'TRANSFER TO SAVINGS 40-12-34 12345678', amt: -300.0 });
    // Subscriptions (with drift)
    rows.push({ d: drift(dateOn(y, m, 7), 1), desc: 'CARD PAYMENT TO NETFLIX.COM', amt: m >= 8 ? -12.99 : -10.99 }); // price increase in Aug
    rows.push({ d: drift(dateOn(y, m, 12), 1), desc: 'SPOTIFY LTD SPOTIFY UK', amt: -11.99 });
    rows.push({ d: drift(dateOn(y, m, 3), 1), desc: 'DD PUREGYM LTD MEMBERSHIP', amt: -29.99 });
    rows.push({ d: drift(dateOn(y, m, 15), 1), desc: 'APPLE.COM/BILL ICLOUD STORAGE', amt: -2.99 });
    if (m <= 7) rows.push({ d: drift(dateOn(y, m, 19), 1), desc: 'DISNEY PLUS SUBSCRIPTION', amt: -7.99 }); // stops after July
    rows.push({ d: dateOn(y, m, 20), desc: 'DD OCTOPUS ENERGY', amt: -98.5 });
    rows.push({ d: dateOn(y, m, 10), desc: 'DD VODAFONE UK', amt: -22.0 });
  }
  // Weekly fruit box every Wednesday
  for (const d of eachDay()) {
    if (d.getUTCDay() === 3) rows.push({ d: new Date(d), desc: 'ODDBOX LTD WEEKLY BOX', amt: -14.99 });
  }
  // Groceries 2–3 times a week, coffee, transport, dining, shopping
  const grocers = ['TESCO STORES 2847 LONDON GB', 'SAINSBURYS S/MKTS 0412', 'LIDL GB LONDON', 'CO-OP GROUP FOOD 02130'];
  const coffee = ['PRET A MANGER 0231 LONDON', 'COSTA COFFEE 12910', 'STARBUCKS 8812 LONDON GB'];
  const dining = ['DELIVEROO.CO.UK LONDON', 'NANDOS CAMDEN', 'JUST EAT.CO.UK', 'WAGAMAMA 073', 'THE CROWN & ANCHOR PUB'];
  const transport = ['TFL TRAVEL CH LONDON', 'UBER *TRIP HELP.UBER.COM', 'TRAINLINE.COM'];
  const shopping = ['AMZN MKTP UK*2K3D9Q5', 'ARGOS LTD ONLINE', 'IKEA WEMBLEY', 'ZARA UK OXFORD ST', 'BOOTS 1874 LONDON'];
  for (const d of eachDay()) {
    const dow = d.getUTCDay();
    if (rand() < 0.4) rows.push({ d: new Date(d), desc: pick(grocers), amt: -money(8, 65) });
    if (dow >= 1 && dow <= 5 && rand() < 0.5) rows.push({ d: new Date(d), desc: pick(coffee), amt: -money(2.8, 6.5) });
    if (dow >= 1 && dow <= 5 && rand() < 0.6) rows.push({ d: new Date(d), desc: 'TFL TRAVEL CH LONDON', amt: -money(2.8, 9.4) });
    if (rand() < 0.18) rows.push({ d: new Date(d), desc: pick(transport.slice(1)), amt: -money(6, 38) });
    if ((dow === 5 || dow === 6) && rand() < 0.55) rows.push({ d: new Date(d), desc: pick(dining), amt: -money(14, 72) });
    if (rand() < 0.12) rows.push({ d: new Date(d), desc: pick(shopping), amt: -money(9, 140) });
    if (rand() < 0.03) rows.push({ d: new Date(d), desc: 'CASH WITHDRAWAL ATM LINK', amt: -pick([20, 30, 50]) });
  }
  // A couple of refunds and a one-off income
  rows.push({ d: dateOn(2026, 6, 14), desc: 'AMZN MKTP UK REFUND', amt: 34.99 });
  rows.push({ d: dateOn(2026, 8, 2), desc: 'HMRC TAX REFUND', amt: 212.4 });
  rows.push({ d: dateOn(2026, 7, 11), desc: 'EASYJET AIRLINE COMPANY', amt: -187.98 });
  rows.push({ d: dateOn(2026, 7, 12), desc: 'AIRBNB * HMJ2KD LISBON', amt: -412.5 });
  rows.push({ d: dateOn(2026, 9, 9), desc: 'BRITISH AIRWAYS 125-1234567', amt: -156.0 });
  rows.push({ d: dateOn(2026, 5, 22), desc: 'ODEON CINEMAS LEICESTER SQ', amt: -27.5 });
  rows.push({ d: dateOn(2026, 8, 30), desc: 'VUE CINEMA WESTFIELD', amt: -24.0 });
  rows.push({ d: dateOn(2026, 6, 3), desc: 'BOOTS PHARMACY 0233', amt: -12.49 });
  rows.push({ d: dateOn(2026, 9, 17), desc: 'SPECSAVERS OPTICIANS', amt: -89.0 });

  const filtered = rows.filter((r) => inRange(r.d)).sort((a, b) => a.d - b.d);
  let balance = 1842.17;
  const lines = ['﻿Date,Description,Amount,Balance'];
  for (const r of filtered) {
    balance = Math.round((balance + r.amt) * 100) / 100;
    lines.push(`${iso(r.d)},"${r.desc}",${r.amt.toFixed(2)},${balance.toFixed(2)}`);
  }
  writeFileSync(join(outDir, 'current-account.csv'), lines.join('\n') + '\n\n', 'utf8');
  console.log('current-account.csv', filtered.length, 'rows');
}

// ---------------------------------------------------------------------------
// File 2: Joint account — DD/MM/YYYY, separate Paid Out / Paid In columns, £ and thousands separators
// ---------------------------------------------------------------------------
{
  const rows = [];
  for (const [y, m] of months) {
    rows.push({ d: dateOn(y, m, 28), type: 'FPI', desc: 'TRANSFER FROM A BARATI', amt: 900.0 });
    rows.push({ d: dateOn(y, m, 28), type: 'FPI', desc: 'TRANSFER FROM S BARATI', amt: 900.0 });
    rows.push({ d: dateOn(y, m, 1), type: 'DD', desc: 'LB CAMDEN COUNCIL TAX', amt: -189.0 });
    rows.push({ d: dateOn(y, m, 5), type: 'DD', desc: 'VIRGIN MEDIA PAYMENTS', amt: -45.0 });
    rows.push({ d: dateOn(y, m, 8), type: 'DD', desc: 'TV LICENCE MBP', amt: -14.12 });
    rows.push({ d: dateOn(y, m, 15), type: 'DD', desc: 'BRITISH GAS', amt: m >= 10 ? -112.0 : -74.0 });
    rows.push({ d: dateOn(y, m, 2), type: 'DD', desc: 'AVIVA HOME INSURANCE', amt: -23.6 });
  }
  // Quarterly water bill: Apr, Jul, Oct
  for (const m of [4, 7, 10]) rows.push({ d: dateOn(2026, m, 11), type: 'DD', desc: 'THAMES WATER UTILITIES', amt: -118.0 });
  const grocers = ['WAITROSE 412 LONDON', 'SAINSBURYS S/MKTS 9131', 'M&S SIMPLY FOOD 0912', 'ALDI STORES 882'];
  for (const d of eachDay()) {
    if (rand() < 0.22) rows.push({ d: new Date(d), type: 'DEB', desc: pick(grocers), amt: -money(20, 90) });
    if (rand() < 0.05) rows.push({ d: new Date(d), type: 'DEB', desc: 'B&Q WAREHOUSE 1209', amt: -money(15, 180) });
    if (rand() < 0.04) rows.push({ d: new Date(d), type: 'DEB', desc: 'SHELL SERVICE STN A406', amt: -money(40, 75) });
    if (rand() < 0.03) rows.push({ d: new Date(d), type: 'DEB', desc: 'PETS AT HOME 3123', amt: -money(12, 60) });
  }
  rows.push({ d: dateOn(2026, 9, 3), type: 'DEB', desc: 'JOHN LEWIS OXFORD ST', amt: -1249.0 });
  rows.push({ d: dateOn(2026, 6, 20), type: 'DEB', desc: 'DENTAL CARE PRACTICE', amt: -65.0 });

  const filtered = rows.filter((r) => inRange(r.d)).sort((a, b) => a.d - b.d);
  let balance = 2310.44;
  const gbp = (n) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = ['Transaction Date,Transaction Type,Description,Paid Out,Paid In,Balance'];
  for (const r of filtered) {
    balance = Math.round((balance + r.amt) * 100) / 100;
    const out = r.amt < 0 ? gbp(-r.amt) : '';
    const inn = r.amt > 0 ? gbp(r.amt) : '';
    lines.push(`${ddmmyyyy(r.d)},${r.type},"${r.desc}","${out}","${inn}","${gbp(balance)}"`);
  }
  writeFileSync(join(outDir, 'joint-account-debit-credit.csv'), lines.join('\r\n') + '\r\n', 'utf8');
  console.log('joint-account-debit-credit.csv', filtered.length, 'rows');
}

// ---------------------------------------------------------------------------
// File 3: US credit card — MM/DD/YYYY, charges POSITIVE and payments negative (needs "invert sign")
// ---------------------------------------------------------------------------
{
  const rows = [];
  for (const [y, m] of months) {
    rows.push({ d: drift(dateOn(y, m, 9), 1), payee: 'APPLE.COM/BILL 866-712-7753 CA', amt: 9.99, memo: 'Apple Music' });
    rows.push({ d: drift(dateOn(y, m, 2), 1), payee: 'Amazon Prime*2R4K91 Amzn.com/bill WA', amt: 14.99, memo: '' });
    rows.push({ d: drift(dateOn(y, m, 17), 1), payee: 'GOOGLE *YouTube Premium', amt: m >= 9 ? 13.99 : 11.99, memo: '' }); // price increase Sep
    rows.push({ d: dateOn(y, m, 27), payee: 'PAYMENT - THANK YOU', amt: -650.0, memo: 'Online payment' });
  }
  const payees = ['STARBUCKS STORE 10342 SEATTLE WA', 'UBER EATS HELP.UBER.COM', 'DOORDASH*CHIPOTLE', 'WHOLEFDS MKT 10259', 'TRADER JOE S #552', 'TARGET 00023451', 'CVS/PHARMACY #09812', 'SHELL OIL 57442312', 'LYFT *RIDE SUN 9PM', 'AMAZON.COM*MK3LD92Q1 AMZN.COM/BILL'];
  for (const d of eachDay()) {
    if (rand() < 0.28) rows.push({ d: new Date(d), payee: pick(payees), amt: money(4, 80), memo: '' });
  }
  rows.push({ d: dateOn(2026, 8, 14), payee: 'DELTA AIR LINES ATLANTA', amt: 486.2, memo: 'Flight' });
  rows.push({ d: dateOn(2026, 8, 20), payee: 'MARRIOTT HOTELS NYC', amt: 612.0, memo: '' });
  rows.push({ d: dateOn(2026, 5, 6), payee: 'STEAM GAMES 425-952-2985', amt: 59.99, memo: '' });
  rows.push({ d: dateOn(2026, 7, 2), payee: 'TARGET 00023451 RETURN', amt: -24.5, memo: 'Return' });

  const filtered = rows.filter((r) => inRange(r.d)).sort((a, b) => a.d - b.d);
  const lines = ['Posted Date,Payee,Amount,Memo'];
  for (const r of filtered) {
    const amt = r.amt < 0 ? `(${(-r.amt).toFixed(2)})` : r.amt.toFixed(2);
    lines.push(`${mmddyyyy(r.d)},"${r.payee}",${amt},"${r.memo}"`);
  }
  writeFileSync(join(outDir, 'us-credit-card.csv'), lines.join('\n') + '\n', 'utf8');
  console.log('us-credit-card.csv', filtered.length, 'rows');
}
