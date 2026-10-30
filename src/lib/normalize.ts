/**
 * Description normalization: produce a stable key for matching/grouping and a
 * clean display merchant name.
 */

const NOISE_WORDS = new Set([
  'card',
  'payment',
  'purchase',
  'pos',
  'visa',
  'debit',
  'credit',
  'contactless',
  'direct',
  'dd',
  'so',
  'ref',
  'transaction',
  'intl',
  'gbp',
  'usd',
  'eur',
  'ltd',
  'llc',
  'inc',
  'plc',
  'com',
  'co',
  'www',
]);

/**
 * Normalize a description to a comparable key: lowercase, strip URLs, dates,
 * times, punctuation and any token containing digits (reference numbers,
 * store ids), drop common noise words, collapse whitespace.
 * Example: "TESCO STORES 3421 CARD 12/03" => "tesco stores".
 */
export function normalizeDescription(raw: string): string {
  let s = (raw ?? '').toLowerCase();
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ');
  s = s.replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  const tokens = s.split(/\s+/).filter((t) => t !== '' && !/\d/.test(t) && !NOISE_WORDS.has(t));
  const out = tokens.join(' ').trim();
  if (out === '') return (raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return out;
}

/** Title-case a normalized key to produce a display merchant name */
export function displayMerchant(raw: string): string {
  const key = normalizeDescription(raw);
  const words = key.split(' ').filter(Boolean).slice(0, 4);
  // Short vowel-less words are almost always acronyms (TFL, CVS, BP); everything else is title-cased.
  return words
    .map((w) => (w.length >= 2 && w.length <= 3 && !/[aeiou]/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * A short contains-match suggestion for building a rule: the first two
 * meaningful words when they appear together in the description, otherwise
 * just the first one (so the suggestion always matches the source transaction).
 */
export function suggestMatchText(raw: string): string {
  const key = normalizeDescription(raw);
  const words = key.split(' ').filter((w) => w.length > 1);
  const lower = (raw ?? '').toLowerCase();
  const two = words.slice(0, 2).join(' ');
  if (words.length >= 2 && lower.includes(two)) return two;
  if (words.length >= 1 && lower.includes(words[0])) return words[0];
  return lower.trim();
}
