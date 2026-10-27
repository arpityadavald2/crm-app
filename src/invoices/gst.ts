export type SupplyType = 'intra' | 'inter';

export interface LineInput {
  quantity: number;
  unitPricePaise: number;
  /** GST rate in basis points: 1800 = 18%, 500 = 5%. */
  gstRateBp: number;
}

export interface LineTax {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface InvoiceTotals {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * Same state => CGST + SGST. Different state => IGST.
 * If the buyer has no state (no GSTIN), we treat the sale as intra-state.
 */
export function determineSupplyType(
  sellerStateCode: string | null,
  buyerStateCode: string | null,
): SupplyType {
  if (!sellerStateCode || !buyerStateCode) return 'intra';
  return sellerStateCode === buyerStateCode ? 'intra' : 'inter';
}

/** Integer math only: round half up, no floating point anywhere. */
export function calculateLine(line: LineInput, supplyType: SupplyType): LineTax {
  assertNonNegativeInteger('quantity', line.quantity);
  assertNonNegativeInteger('unitPricePaise', line.unitPricePaise);
  assertNonNegativeInteger('gstRateBp', line.gstRateBp);

  const taxablePaise = line.quantity * line.unitPricePaise;
  assertNonNegativeInteger('taxablePaise', taxablePaise);

  // tax = taxable * rate / 10000, rounded half up
  const taxPaise = Math.floor((taxablePaise * line.gstRateBp + 5000) / 10000);
  assertNonNegativeInteger('taxPaise', taxPaise);

  if (supplyType === 'inter') {
    return {
      taxablePaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: taxPaise,
      totalPaise: taxablePaise + taxPaise,
    };
  }

  // Split the already-rounded tax, so CGST + SGST always equals the line tax exactly.
  const cgstPaise = Math.floor(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;
  return {
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise: 0,
    totalPaise: taxablePaise + taxPaise,
  };
}

export function calculateInvoice(lines: LineInput[], supplyType: SupplyType) {
  const lineTaxes = lines.map((line) => calculateLine(line, supplyType));
  const totals: InvoiceTotals = lineTaxes.reduce(
    (sum, tax) => ({
      subtotalPaise: sum.subtotalPaise + tax.taxablePaise,
      cgstPaise: sum.cgstPaise + tax.cgstPaise,
      sgstPaise: sum.sgstPaise + tax.sgstPaise,
      igstPaise: sum.igstPaise + tax.igstPaise,
      totalPaise: sum.totalPaise + tax.totalPaise,
    }),
    { subtotalPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 },
  );
  return { lines: lineTaxes, totals };
}
