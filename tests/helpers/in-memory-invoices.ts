import type { InMemoryCustomerRepository } from './in-memory-customers';
import { fiscalYearOf, formatInvoiceNumber } from '../../src/invoices/numbering';
import type {
  CancelResult,
  Invoice,
  InvoiceListOptions,
  InvoiceRepository,
  InvoiceSummary,
  IssueResult,
  NewInvoice,
  Parties,
} from '../../src/invoices/repository';

/** A fake "database" with the same org_id, numbering and status rules as the MySQL one. */
export class InMemoryInvoiceRepository implements InvoiceRepository {
  readonly rows: Invoice[] = [];
  private nextId = 1;
  private nextItemId = 1;
  private counters = new Map<string, number>();

  /** orgStateCodes: the GST state code of each organization, e.g. { 1: '03' }. */
  constructor(
    private readonly customers: InMemoryCustomerRepository,
    private readonly orgStateCodes: Record<number, string | null> = {},
    private readonly orgGstins: Record<number, string | null> = {},
  ) {}

  private find(orgId: number, id: number): Invoice | undefined {
    return this.rows.find((row) => row.orgId === orgId && row.id === id);
  }

  async findParties(orgId: number, customerId: number): Promise<Parties | null> {
    const customer = await this.customers.findById(orgId, customerId);
    if (!customer) return null;
    return {
      sellerStateCode: this.orgStateCodes[orgId] ?? null,
      sellerGstin: this.orgGstins[orgId] ?? null,
      buyerStateCode: customer.stateCode,
    };
  }

  async createDraft(orgId: number, input: NewInvoice): Promise<Invoice> {
    const invoice: Invoice = {
      id: this.nextId++,
      orgId,
      customerId: input.customerId,
      invoiceNumber: null,
      status: 'draft',
      issueDate: null,
      dueDate: input.dueDate,
      supplyType: input.supplyType,
      sellerStateCode: input.sellerStateCode,
      sellerGstin: input.sellerGstin,
      buyerStateCode: input.buyerStateCode,
      subtotalPaise: input.totals.subtotalPaise,
      cgstPaise: input.totals.cgstPaise,
      sgstPaise: input.totals.sgstPaise,
      igstPaise: input.totals.igstPaise,
      totalPaise: input.totals.totalPaise,
      amountPaidPaise: 0,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      items: input.items.map((item) => ({ id: this.nextItemId++, ...item })),
    };
    this.rows.push(invoice);
    return structuredClone(invoice);
  }

  async list(orgId: number, { limit, offset, status, customerId }: InvoiceListOptions) {
    const matches = this.rows
      .filter((row) => row.orgId === orgId)
      .filter((row) => !status || row.status === status)
      .filter((row) => !customerId || row.customerId === customerId)
      .sort((a, b) => b.id - a.id);
    return {
      items: matches.slice(offset, offset + limit).map((row) => this.summary(row)),
      total: matches.length,
    };
  }

  async findById(orgId: number, id: number): Promise<Invoice | null> {
    const row = this.find(orgId, id);
    return row ? structuredClone(row) : null;
  }

  async issue(orgId: number, id: number, issueDate: string): Promise<IssueResult> {
    const row = this.find(orgId, id);
    if (!row) return { kind: 'not_found' };
    if (row.status !== 'draft') return { kind: 'not_draft' };
    const fiscalYear = fiscalYearOf(issueDate);
    const key = `${orgId}:${fiscalYear}`;
    const sequence = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, sequence);
    row.invoiceNumber = formatInvoiceNumber(fiscalYear, sequence);
    row.status = 'issued';
    row.issueDate = issueDate;
    return { kind: 'issued', invoice: structuredClone(row) };
  }

  async cancel(orgId: number, id: number): Promise<CancelResult> {
    const row = this.find(orgId, id);
    if (!row) return { kind: 'not_found' };
    const cancellable =
      (row.status === 'draft' || row.status === 'issued') && row.amountPaidPaise === 0;
    if (!cancellable) return { kind: 'not_cancellable' };
    row.status = 'cancelled';
    return { kind: 'cancelled', invoice: structuredClone(row) };
  }

  private summary(row: Invoice): InvoiceSummary {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items: _items, ...summary } = row;
    return structuredClone(summary);
  }
}
