import { describe, expect, it } from 'vitest';
import { fiscalYearOf, formatInvoiceNumber, todayInIndia } from '../../src/invoices/numbering';

describe('fiscalYearOf', () => {
  it('April starts a new financial year', () => {
    expect(fiscalYearOf('2026-04-01')).toBe('2026-27');
  });
  it('March is still the old financial year', () => {
    expect(fiscalYearOf('2027-03-31')).toBe('2026-27');
    expect(fiscalYearOf('2026-03-31')).toBe('2025-26');
  });
  it('October 2026 is 2026-27', () => {
    expect(fiscalYearOf('2026-10-27')).toBe('2026-27');
  });
  it('rejects a bad date', () => {
    expect(() => fiscalYearOf('nonsense')).toThrow();
  });
});

describe('formatInvoiceNumber', () => {
  it('pads to 4 digits', () => {
    expect(formatInvoiceNumber('2026-27', 1)).toBe('INV/2026-27/0001');
    expect(formatInvoiceNumber('2026-27', 123)).toBe('INV/2026-27/0123');
  });
});

describe('todayInIndia', () => {
  it('uses the Indian date, not UTC (20:00 UTC is already the next day in India)', () => {
    expect(todayInIndia(new Date('2026-10-27T20:00:00Z'))).toBe('2026-10-28');
  });
});
