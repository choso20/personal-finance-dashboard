import { describe, expect, it } from 'vitest';
import { displayMerchant, normalizeDescription, suggestMatchText } from './normalize';
import { transactionHash } from './hash';

describe('normalizeDescription', () => {
  it('lowercases and strips reference numbers and noise words', () => {
    expect(normalizeDescription('TESCO STORES 3421 CARD 12/03')).toBe('tesco stores');
    expect(normalizeDescription('CARD PAYMENT TO NETFLIX.COM,12.99 GBP')).toBe('to netflix');
    expect(normalizeDescription('Uber *Trip 8X2JD')).toBe('uber trip');
  });
  it('keeps something when everything is noise', () => {
    expect(normalizeDescription('12345')).toBe('12345');
  });
  it('is stable across whitespace/punctuation differences', () => {
    expect(normalizeDescription('Spotify  Ltd')).toBe(normalizeDescription('SPOTIFY LTD.'));
  });
});

describe('displayMerchant', () => {
  it('title-cases the normalized key', () => {
    expect(displayMerchant('TESCO STORES 3421')).toBe('Tesco Stores');
    expect(displayMerchant('amazon prime')).toBe('Amazon Prime');
    expect(displayMerchant('TFL TRAVEL CH LONDON')).toBe('TFL Travel CH London');
    expect(displayMerchant('ODDBOX LTD WEEKLY BOX')).toBe('Oddbox Weekly Box');
  });
});

describe('suggestMatchText', () => {
  it('suggests the first two meaningful words', () => {
    expect(suggestMatchText('TESCO STORES 3421 CARD')).toBe('tesco stores');
    expect(suggestMatchText('NETFLIX.COM')).toBe('netflix');
    expect(suggestMatchText('ODDBOX LTD WEEKLY BOX')).toBe('oddbox');
    expect(suggestMatchText('UBER *TRIP HELP.UBER.COM')).toBe('uber');
  });
});

describe('transactionHash', () => {
  const base = { date: '2024-03-05', amount: -1234, description: 'TESCO STORES 3421', account: 'Current' };
  it('is deterministic', () => {
    expect(transactionHash(base)).toBe(transactionHash({ ...base }));
    expect(transactionHash(base)).toMatch(/^[0-9a-f]{16}$/);
  });
  it('ignores reference numbers and case in the description', () => {
    expect(transactionHash(base)).toBe(transactionHash({ ...base, description: 'tesco stores 9999' }));
  });
  it('changes when date, amount or account changes', () => {
    expect(transactionHash(base)).not.toBe(transactionHash({ ...base, date: '2024-03-06' }));
    expect(transactionHash(base)).not.toBe(transactionHash({ ...base, amount: -1235 }));
    expect(transactionHash(base)).not.toBe(transactionHash({ ...base, account: 'Savings' }));
  });
  it('distinguishes ordinals', () => {
    expect(transactionHash(base)).not.toBe(transactionHash({ ...base, ordinal: 1 }));
  });
});
