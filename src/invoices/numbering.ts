/** Indian financial year runs April to March: 2026-04-01 .. 2027-03-31 is "2026-27". */
export function fiscalYearOf(isoDate: string): string {
  const [yearText, monthText] = isoDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid date: ${isoDate}`);
  }
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function formatInvoiceNumber(fiscalYear: string, sequence: number): string {
  return `INV/${fiscalYear}/${String(sequence).padStart(4, '0')}`;
}

/** Today's date (YYYY-MM-DD) in India, whatever timezone the server runs in. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}
