import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { mysqlInvoiceRepository, type Invoice } from '../invoices/repository';
import type { InvoiceStatus } from '../invoices/schemas';
import type { PaymentMethod } from './schemas';

export interface Payment {
  id: number;
  invoiceId: number;
  amountPaise: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
}

export interface NewPayment {
  amountPaise: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
}

export type AddPaymentResult =
  | { kind: 'not_found' }
  | { kind: 'not_payable' }
  | { kind: 'overpayment'; balancePaise: number }
  | { kind: 'before_issue_date'; issueDate: string }
  | { kind: 'recorded'; payment: Payment; invoice: Invoice };

/** Every method takes orgId first and uses it in every query. */
export interface PaymentRepository {
  addPayment(orgId: number, invoiceId: number, input: NewPayment): Promise<AddPaymentResult>;
  /** null = the invoice does not exist in this organization. */
  list(orgId: number, invoiceId: number): Promise<Payment[] | null>;
}

interface PaymentRow extends RowDataPacket {
  id: number;
  invoice_id: number;
  amount_paise: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  created_at: Date;
}

const COLUMNS = `id, invoice_id, amount_paise, DATE_FORMAT(paid_on, '%Y-%m-%d') AS paid_on,
  method, reference, created_at`;

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amountPaise: Number(row.amount_paise),
    paidOn: row.paid_on,
    method: row.method,
    reference: row.reference,
    createdAt: row.created_at.toISOString(),
  };
}

export const mysqlPaymentRepository: PaymentRepository = {
  // The invoice row is locked, the payment is saved and the invoice totals/status are updated
  // in ONE transaction. Two payments at the same moment cannot overpay the invoice.
  async addPayment(orgId, invoiceId, input) {
    const conn = await pool.getConnection();
    let paymentId: number;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute<
        (RowDataPacket & {
          status: InvoiceStatus;
          total_paise: number;
          amount_paid_paise: number;
          issue_date: string | null;
        })[]
      >(
        `SELECT status, total_paise, amount_paid_paise,
                DATE_FORMAT(issue_date, '%Y-%m-%d') AS issue_date
           FROM invoices WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE`,
        [invoiceId, orgId],
      );
      const invoice = rows[0];
      if (!invoice) {
        await conn.rollback();
        return { kind: 'not_found' };
      }
      if (invoice.status !== 'issued' && invoice.status !== 'partially_paid') {
        await conn.rollback();
        return { kind: 'not_payable' };
      }
      const total = Number(invoice.total_paise);
      const alreadyPaid = Number(invoice.amount_paid_paise);
      const balancePaise = total - alreadyPaid;
      if (input.amountPaise > balancePaise) {
        await conn.rollback();
        return { kind: 'overpayment', balancePaise };
      }
      if (invoice.issue_date && input.paidOn < invoice.issue_date) {
        await conn.rollback();
        return { kind: 'before_issue_date', issueDate: invoice.issue_date };
      }

      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO payments (org_id, invoice_id, amount_paise, paid_on, method, reference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, invoiceId, input.amountPaise, input.paidOn, input.method, input.reference],
      );
      paymentId = inserted.insertId;

      const newPaid = alreadyPaid + input.amountPaise;
      await conn.execute(
        `UPDATE invoices SET amount_paid_paise = ?, status = ? WHERE id = ? AND org_id = ?`,
        [newPaid, newPaid === total ? 'paid' : 'partially_paid', invoiceId, orgId],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const [paymentRows] = await pool.execute<PaymentRow[]>(
      `SELECT ${COLUMNS} FROM payments WHERE id = ? AND org_id = ? LIMIT 1`,
      [paymentId, orgId],
    );
    const row = paymentRows[0];
    const invoice = await mysqlInvoiceRepository.findById(orgId, invoiceId);
    if (!row || !invoice) throw new Error('Payment vanished right after insert');
    return { kind: 'recorded', payment: toPayment(row), invoice };
  },

  async list(orgId, invoiceId) {
    const [invoices] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM invoices WHERE id = ? AND org_id = ? LIMIT 1`,
      [invoiceId, orgId],
    );
    if (!invoices[0]) return null;
    const [rows] = await pool.execute<PaymentRow[]>(
      `SELECT ${COLUMNS} FROM payments WHERE invoice_id = ? AND org_id = ? ORDER BY id`,
      [invoiceId, orgId],
    );
    return rows.map(toPayment);
  },
};
