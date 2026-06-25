import { describe, it, expect } from 'vitest';
import {
  csvDateToISO,
  filterNewTransactions,
  computeNewLastImport,
  transformCSV,
} from './converter';

// Helpers
const row = (date, ref, amount = '-10.00', type = 'clearing') => ({
  'Reference Number': ref,
  'Transaction Post Date': date,
  'Description of Transaction': 'Test Merchant',
  'Transaction Type': type,
  Amount: amount,
});

describe('csvDateToISO', () => {
  it('converts MM/DD/YY to YYYY-MM-DD', () => {
    expect(csvDateToISO('06/24/26')).toBe('2026-06-24');
  });

  it('zero-pads single-digit month and day', () => {
    expect(csvDateToISO('01/05/26')).toBe('2026-01-05');
  });

  it('produces strings that sort lexicographically by date', () => {
    const dates = ['12/31/25', '01/01/26', '06/15/26'].map(csvDateToISO);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('filterNewTransactions', () => {
  it('returns all rows when no lastImport exists', () => {
    const data = [row('06/24/26', 'A'), row('06/25/26', 'B')];
    expect(filterNewTransactions(data, null)).toEqual(data);
  });

  it('filters out rows from dates before lastImport.date', () => {
    const data = [row('06/23/26', 'OLD'), row('06/25/26', 'NEW')];
    const last = { date: '2026-06-24', refNumbers: [] };
    const result = filterNewTransactions(data, last);
    expect(result).toHaveLength(1);
    expect(result[0]['Reference Number']).toBe('NEW');
  });

  it('filters out rows on lastImport.date whose ref is already tracked', () => {
    const data = [row('06/24/26', 'SEEN'), row('06/24/26', 'UNSEEN')];
    const last = { date: '2026-06-24', refNumbers: ['SEEN'] };
    const result = filterNewTransactions(data, last);
    expect(result).toHaveLength(1);
    expect(result[0]['Reference Number']).toBe('UNSEEN');
  });

  it('includes rows on lastImport.date with a new reference number', () => {
    const data = [row('06/24/26', 'C')];
    const last = { date: '2026-06-24', refNumbers: ['A', 'B'] };
    expect(filterNewTransactions(data, last)).toHaveLength(1);
  });

  it('includes all rows after lastImport.date regardless of ref', () => {
    const data = [row('06/25/26', 'X'), row('06/26/26', 'Y')];
    const last = { date: '2026-06-24', refNumbers: ['X'] }; // X is tracked but on a later date
    expect(filterNewTransactions(data, last)).toHaveLength(2);
  });

  it('returns empty array when all rows are already imported', () => {
    const data = [row('06/23/26', 'A'), row('06/24/26', 'B')];
    const last = { date: '2026-06-24', refNumbers: ['B'] };
    expect(filterNewTransactions(data, last)).toHaveLength(0);
  });
});

describe('computeNewLastImport', () => {
  it('returns the latest date and its ref numbers from the data', () => {
    const data = [row('06/24/26', 'A'), row('06/25/26', 'B'), row('06/25/26', 'C')];
    const result = computeNewLastImport(data, null);
    expect(result).toEqual({ date: '2026-06-25', refNumbers: ['B', 'C'] });
  });

  it('merges ref numbers when the latest date matches existing', () => {
    const data = [row('06/25/26', 'C')];
    const existing = { date: '2026-06-25', refNumbers: ['A', 'B'] };
    const result = computeNewLastImport(data, existing);
    expect(result.date).toBe('2026-06-25');
    expect(result.refNumbers).toContain('A');
    expect(result.refNumbers).toContain('B');
    expect(result.refNumbers).toContain('C');
  });

  it('deduplicates ref numbers when merging', () => {
    const data = [row('06/25/26', 'A')];
    const existing = { date: '2026-06-25', refNumbers: ['A'] };
    const result = computeNewLastImport(data, existing);
    expect(result.refNumbers.filter(r => r === 'A')).toHaveLength(1);
  });

  it('replaces existing state when a later date is found', () => {
    const data = [row('06/26/26', 'NEW')];
    const existing = { date: '2026-06-25', refNumbers: ['OLD'] };
    const result = computeNewLastImport(data, existing);
    expect(result).toEqual({ date: '2026-06-26', refNumbers: ['NEW'] });
  });

  it('falls back to existing when data is empty', () => {
    const existing = { date: '2026-06-24', refNumbers: ['A'] };
    expect(computeNewLastImport([], existing)).toStrictEqual(existing);
  });

  it('returns null-ish existing when data is empty and no existing state', () => {
    expect(computeNewLastImport([], null)).toBeNull();
  });
});

describe('transformCSV', () => {
  it('negates amount (Gemini uses negative for debits)', () => {
    const result = transformCSV([row('06/24/26', 'A', '-18.60')]);
    expect(result[0].Amount).toBe(18.60);
  });

  it('marks positive amounts as credit', () => {
    const result = transformCSV([row('06/24/26', 'A', '-50.00')]);
    expect(result[0]['Transaction Type']).toBe('credit');
  });

  it('marks negative amounts (payments) as credit after negation', () => {
    const result = transformCSV([row('06/24/26', 'A', '100.00')]);
    expect(result[0].Amount).toBe(-100);
    expect(result[0]['Transaction Type']).toBe('debit');
  });

  it('maps payment_transaction type to credit card payment category', () => {
    const result = transformCSV([row('06/24/26', 'A', '-50.00', 'payment_transaction')]);
    expect(result[0].Category).toBe('Transfer:Credit Card Payment');
  });

  it('maps other transaction types to Uncategorized', () => {
    const result = transformCSV([row('06/24/26', 'A', '-10.00', 'clearing')]);
    expect(result[0].Category).toBe('Uncategorized');
  });

  it('carries reference number through to output', () => {
    const result = transformCSV([row('06/24/26', '6422785300')]);
    expect(result[0].Reference).toBe('6422785300');
  });
});
