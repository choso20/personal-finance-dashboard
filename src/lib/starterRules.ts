import type { Rule } from '../types';

interface Starter {
  name: string;
  contains: string[];
  categoryId: string;
  merchant?: string;
  sign?: 'debit' | 'credit';
}

/**
 * Common merchants. Each becomes one rule per `contains` entry so that users
 * can delete/edit them individually. Kept generic (UK + US chains).
 */
const STARTERS: Starter[] = [
  // Groceries
  { name: 'Tesco', contains: ['tesco'], categoryId: 'cat_groceries', merchant: 'Tesco' },
  { name: 'Sainsbury\'s', contains: ['sainsbury'], categoryId: 'cat_groceries', merchant: "Sainsbury's" },
  { name: 'Asda', contains: ['asda'], categoryId: 'cat_groceries', merchant: 'Asda' },
  { name: 'Aldi', contains: ['aldi'], categoryId: 'cat_groceries', merchant: 'Aldi' },
  { name: 'Lidl', contains: ['lidl'], categoryId: 'cat_groceries', merchant: 'Lidl' },
  { name: 'Morrisons', contains: ['morrisons'], categoryId: 'cat_groceries', merchant: 'Morrisons' },
  { name: 'Waitrose', contains: ['waitrose'], categoryId: 'cat_groceries', merchant: 'Waitrose' },
  { name: 'M&S Food', contains: ['marks & spencer', 'marks and spencer', 'm&s'], categoryId: 'cat_groceries', merchant: 'M&S' },
  { name: 'Co-op', contains: ['co-op', 'coop'], categoryId: 'cat_groceries', merchant: 'Co-op' },
  { name: 'Whole Foods', contains: ['whole foods', 'wholefds'], categoryId: 'cat_groceries', merchant: 'Whole Foods' },
  { name: 'Trader Joe\'s', contains: ['trader joe'], categoryId: 'cat_groceries', merchant: "Trader Joe's" },
  { name: 'Kroger', contains: ['kroger'], categoryId: 'cat_groceries', merchant: 'Kroger' },
  { name: 'Walmart', contains: ['walmart', 'wal-mart'], categoryId: 'cat_groceries', merchant: 'Walmart' },
  { name: 'Costco', contains: ['costco'], categoryId: 'cat_groceries', merchant: 'Costco' },
  // Dining
  { name: 'Starbucks', contains: ['starbucks'], categoryId: 'cat_dining', merchant: 'Starbucks' },
  { name: 'Costa', contains: ['costa coffee', 'costa'], categoryId: 'cat_dining', merchant: 'Costa Coffee' },
  { name: 'Pret', contains: ['pret a manger', 'pret'], categoryId: 'cat_dining', merchant: 'Pret a Manger' },
  { name: 'McDonald\'s', contains: ['mcdonald'], categoryId: 'cat_dining', merchant: "McDonald's" },
  { name: 'Greggs', contains: ['greggs'], categoryId: 'cat_dining', merchant: 'Greggs' },
  { name: 'Deliveroo', contains: ['deliveroo'], categoryId: 'cat_dining', merchant: 'Deliveroo' },
  { name: 'Just Eat', contains: ['just eat', 'justeat'], categoryId: 'cat_dining', merchant: 'Just Eat' },
  { name: 'Uber Eats', contains: ['uber eats', 'ubereats', 'uber *eats'], categoryId: 'cat_dining', merchant: 'Uber Eats' },
  { name: 'DoorDash', contains: ['doordash'], categoryId: 'cat_dining', merchant: 'DoorDash' },
  { name: 'Nando\'s', contains: ['nando'], categoryId: 'cat_dining', merchant: "Nando's" },
  // Transport
  { name: 'Uber', contains: ['uber trip', 'uber *trip', 'uber bv'], categoryId: 'cat_transport', merchant: 'Uber' },
  { name: 'Lyft', contains: ['lyft'], categoryId: 'cat_transport', merchant: 'Lyft' },
  { name: 'Bolt', contains: ['bolt.eu', 'bolt '], categoryId: 'cat_transport', merchant: 'Bolt' },
  { name: 'TfL', contains: ['tfl travel', 'tfl.gov', 'transport for london'], categoryId: 'cat_transport', merchant: 'TfL' },
  { name: 'Trainline', contains: ['trainline'], categoryId: 'cat_transport', merchant: 'Trainline' },
  { name: 'Shell', contains: ['shell'], categoryId: 'cat_transport', merchant: 'Shell' },
  { name: 'BP', contains: ['bp '], categoryId: 'cat_transport', merchant: 'BP' },
  { name: 'Esso', contains: ['esso'], categoryId: 'cat_transport', merchant: 'Esso' },
  // Subscriptions
  { name: 'Netflix', contains: ['netflix'], categoryId: 'cat_subscriptions', merchant: 'Netflix' },
  { name: 'Spotify', contains: ['spotify'], categoryId: 'cat_subscriptions', merchant: 'Spotify' },
  { name: 'Disney+', contains: ['disney plus', 'disneyplus', 'disney+'], categoryId: 'cat_subscriptions', merchant: 'Disney+' },
  { name: 'Amazon Prime', contains: ['amazon prime', 'prime video', 'amznprime', 'prime membership'], categoryId: 'cat_subscriptions', merchant: 'Amazon Prime' },
  { name: 'Apple', contains: ['apple.com/bill', 'apple.com bill', 'itunes'], categoryId: 'cat_subscriptions', merchant: 'Apple' },
  { name: 'Google', contains: ['google *', 'google storage', 'google one', 'youtube premium'], categoryId: 'cat_subscriptions', merchant: 'Google' },
  { name: 'Microsoft', contains: ['microsoft*', 'msft'], categoryId: 'cat_subscriptions', merchant: 'Microsoft' },
  { name: 'Audible', contains: ['audible'], categoryId: 'cat_subscriptions', merchant: 'Audible' },
  { name: 'NOW TV', contains: ['now tv', 'nowtv'], categoryId: 'cat_subscriptions', merchant: 'NOW TV' },
  { name: 'Gym', contains: ['puregym', 'the gym group', 'david lloyd', 'planet fitness'], categoryId: 'cat_health', merchant: 'Gym' },
  // Shopping
  { name: 'Amazon', contains: ['amazon', 'amzn'], categoryId: 'cat_shopping', merchant: 'Amazon' },
  { name: 'eBay', contains: ['ebay'], categoryId: 'cat_shopping', merchant: 'eBay' },
  { name: 'Argos', contains: ['argos'], categoryId: 'cat_shopping', merchant: 'Argos' },
  { name: 'IKEA', contains: ['ikea'], categoryId: 'cat_shopping', merchant: 'IKEA' },
  { name: 'Target', contains: ['target'], categoryId: 'cat_shopping', merchant: 'Target' },
  // Health
  { name: 'Boots', contains: ['boots'], categoryId: 'cat_health', merchant: 'Boots' },
  { name: 'CVS', contains: ['cvs pharmacy', 'cvs/pharm'], categoryId: 'cat_health', merchant: 'CVS' },
  { name: 'Walgreens', contains: ['walgreens'], categoryId: 'cat_health', merchant: 'Walgreens' },
  // Entertainment
  { name: 'Cinema', contains: ['odeon', 'vue cinema', 'cineworld', 'amc theatres'], categoryId: 'cat_entertainment', merchant: 'Cinema' },
  { name: 'Steam', contains: ['steam games', 'steampowered'], categoryId: 'cat_entertainment', merchant: 'Steam' },
  // Travel
  { name: 'Airbnb', contains: ['airbnb'], categoryId: 'cat_travel', merchant: 'Airbnb' },
  { name: 'Booking.com', contains: ['booking.com'], categoryId: 'cat_travel', merchant: 'Booking.com' },
  { name: 'easyJet', contains: ['easyjet'], categoryId: 'cat_travel', merchant: 'easyJet' },
  { name: 'Ryanair', contains: ['ryanair'], categoryId: 'cat_travel', merchant: 'Ryanair' },
  { name: 'British Airways', contains: ['british airways'], categoryId: 'cat_travel', merchant: 'British Airways' },
  // Utilities
  { name: 'Energy', contains: ['octopus energy', 'british gas', 'edf energy', 'eon ', 'ovo energy', 'scottish power'], categoryId: 'cat_utilities', merchant: 'Energy' },
  { name: 'Water', contains: ['thames water', 'severn trent', 'anglian water', 'united utilities'], categoryId: 'cat_utilities', merchant: 'Water' },
  { name: 'Broadband', contains: ['virgin media', 'bt group', 'sky digital', 'plusnet', 'talktalk'], categoryId: 'cat_utilities', merchant: 'Broadband' },
  { name: 'Mobile', contains: ['vodafone', 'ee limited', 'o2 ', 'three.co.uk', 'giffgaff', 'verizon', 't-mobile'], categoryId: 'cat_utilities', merchant: 'Mobile' },
  { name: 'Council tax', contains: ['council tax'], categoryId: 'cat_utilities', merchant: 'Council Tax' },
  // Rent / mortgage
  { name: 'Rent', contains: ['rent'], categoryId: 'cat_rent', sign: 'debit', merchant: 'Rent' },
  { name: 'Mortgage', contains: ['mortgage'], categoryId: 'cat_rent', sign: 'debit', merchant: 'Mortgage' },
  // Income
  { name: 'Salary', contains: ['salary', 'payroll', 'wages'], categoryId: 'cat_income', sign: 'credit' },
  { name: 'Interest', contains: ['interest'], categoryId: 'cat_income', sign: 'credit' },
  { name: 'Refund', contains: ['refund'], categoryId: 'cat_income', sign: 'credit' },
  // Transfers
  { name: 'Transfer', contains: ['transfer to', 'transfer from', 'tfr to', 'tfr from', 'savings'], categoryId: 'cat_transfers' },
  { name: 'Credit card payment', contains: ['credit card payment', 'card payment to', 'amex payment'], categoryId: 'cat_transfers' },
  { name: 'PayPal', contains: ['paypal'], categoryId: 'cat_shopping', merchant: 'PayPal' },
];

/** Build the starter rule set. Ids are stable so re-seeding won't duplicate. */
export function buildStarterRules(): Rule[] {
  const rules: Rule[] = [];
  let priority = 1000; // leave room for user rules above
  for (const s of STARTERS) {
    s.contains.forEach((text, i) => {
      const id = `starter_${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${i}`;
      rules.push({
        id,
        name: s.contains.length > 1 ? `${s.name} (${text.trim()})` : s.name,
        priority: priority++,
        enabled: true,
        conditions: [
          { type: 'description', op: 'contains', value: text },
          ...(s.sign ? [{ type: 'amountSign' as const, sign: s.sign }] : []),
        ],
        action: { categoryId: s.categoryId, merchantName: s.merchant },
        isStarter: true,
      });
    });
  }
  return rules;
}
