import { describe, expect, it } from 'vitest';
import { calculateInvoice, calculateLine, determineSupplyType } from '../../src/invoices/gst';

describe('determineSupplyType', () => {
  it('is intra when both states match', () => {
    expect(determineSupplyType('03', '03')).toBe('intra');
  });
  it('is inter when states differ', () => {
    expect(determineSupplyType('03', '29')).toBe('inter');
  });
  it('is intra when the buyer has no state', () => {
    expect(determineSupplyType('03', null)).toBe('intra');
  });
});

describe('calculateLine: intra-state (CGST + SGST)', () => {
  it('Rs 500 x 2 at 18%', () => {
    expect(calculateLine({ quantity: 2, unitPricePaise: 50000, gstRateBp: 1800 }, 'intra')).toEqual(
      {
        taxablePaise: 100000,
        cgstPaise: 9000,
        sgstPaise: 9000,
        igstPaise: 0,
        totalPaise: 118000,
      },
    );
  });

  it('rounds the tax to the nearest paisa (12345 at 18% = 2222.1 -> 2222)', () => {
    const tax = calculateLine({ quantity: 1, unitPricePaise: 12345, gstRateBp: 1800 }, 'intra');
    expect(tax.cgstPaise + tax.sgstPaise).toBe(2222);
    expect(tax.totalPaise).toBe(12345 + 2222);
  });

  it('rounds half up (10 paise at 5% = 0.5 -> 1)', () => {
    const tax = calculateLine({ quantity: 1, unitPricePaise: 10, gstRateBp: 500 }, 'intra');
    expect(tax.cgstPaise + tax.sgstPaise).toBe(1);
  });

  it('keeps CGST + SGST equal to the line tax when it is odd', () => {
    const tax = calculateLine({ quantity: 1, unitPricePaise: 10, gstRateBp: 500 }, 'intra');
    expect(tax.cgstPaise).toBe(0);
    expect(tax.sgstPaise).toBe(1);
  });

  it('charges no tax at 0%', () => {
    const tax = calculateLine({ quantity: 3, unitPricePaise: 1000, gstRateBp: 0 }, 'intra');
    expect(tax.totalPaise).toBe(3000);
    expect(tax.cgstPaise + tax.sgstPaise).toBe(0);
  });
});

describe('calculateLine: inter-state (IGST)', () => {
  it('puts the whole tax in IGST', () => {
    expect(calculateLine({ quantity: 2, unitPricePaise: 50000, gstRateBp: 1800 }, 'inter')).toEqual(
      {
        taxablePaise: 100000,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 18000,
        totalPaise: 118000,
      },
    );
  });
});

describe('calculateLine: bad input', () => {
  it('rejects fractions and negatives', () => {
    expect(() =>
      calculateLine({ quantity: 1.5, unitPricePaise: 100, gstRateBp: 1800 }, 'intra'),
    ).toThrow();
    expect(() =>
      calculateLine({ quantity: 1, unitPricePaise: -100, gstRateBp: 1800 }, 'intra'),
    ).toThrow();
    expect(() =>
      calculateLine({ quantity: 1, unitPricePaise: 100, gstRateBp: 18.5 }, 'intra'),
    ).toThrow();
  });
});

describe('calculateInvoice', () => {
  it('adds up lines with different rates', () => {
    const { totals } = calculateInvoice(
      [
        { quantity: 2, unitPricePaise: 50000, gstRateBp: 1800 },
        { quantity: 1, unitPricePaise: 20000, gstRateBp: 500 },
      ],
      'intra',
    );
    expect(totals).toEqual({
      subtotalPaise: 120000,
      cgstPaise: 9500,
      sgstPaise: 9500,
      igstPaise: 0,
      totalPaise: 139000,
    });
  });

  it('total always equals subtotal + all taxes', () => {
    const { totals } = calculateInvoice(
      [
        { quantity: 7, unitPricePaise: 3333, gstRateBp: 1200 },
        { quantity: 3, unitPricePaise: 999, gstRateBp: 2800 },
      ],
      'inter',
    );
    expect(totals.totalPaise).toBe(
      totals.subtotalPaise + totals.cgstPaise + totals.sgstPaise + totals.igstPaise,
    );
  });

  it('returns zeros for an empty invoice', () => {
    expect(calculateInvoice([], 'intra').totals.totalPaise).toBe(0);
  });
});
