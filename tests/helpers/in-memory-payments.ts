import type { InMemoryInvoiceRepository } from './in-memory-invoices';
import type {
  AddPaymentResult,
  NewPayment,
  Payment,
  PaymentRepository,
} from '../../src/payments/repository';

/** A fake "database" with the same status, balance and date rules as the MySQL one. */
export class InMemoryPaymentRepository implements PaymentRepository {
  private payments: (Payment & { orgId: number })[] = [];
  private nextId = 1;

  constructor(private readonly invoices: InMemoryInvoiceRepository) {}

  async addPayment(orgId: number, invoiceId: number, input: NewPayment): Promise<AddPaymentResult> {
    const invoice = this.invoices.rows.find((r) => r.orgId === orgId && r.id === invoiceId);
    if (!invoice) return { kind: 'not_found' };
    if (invoice.status !== 'issued' && invoice.status !== 'partially_paid') {
      return { kind: 'not_payable' };
    }
    const balancePaise = invoice.totalPaise - invoice.amountPaidPaise;
    if (input.amountPaise > balancePaise) return { kind: 'overpayment', balancePaise };
    if (invoice.issueDate && input.paidOn < invoice.issueDate) {
      return { kind: 'before_issue_date', issueDate: invoice.issueDate };
    }

    const payment: Payment = {
      id: this.nextId++,
      invoiceId,
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.payments.push({ ...payment, orgId });
    invoice.amountPaidPaise += input.amountPaise;
    invoice.status = invoice.amountPaidPaise === invoice.totalPaise ? 'paid' : 'partially_paid';
    return { kind: 'recorded', payment, invoice: structuredClone(invoice) };
  }

  async list(orgId: number, invoiceId: number): Promise<Payment[] | null> {
    const invoice = this.invoices.rows.find((r) => r.orgId === orgId && r.id === invoiceId);
    if (!invoice) return null;
    return this.payments
      .filter((p) => p.orgId === orgId && p.invoiceId === invoiceId)
      .map(({ orgId: _orgId, ...payment }) => payment);
  }
}
