import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import type { InvoiceTotals, SupplyType } from './gst';
import { fiscalYearOf, formatInvoiceNumber } from './numbering';
import type { InvoiceStatus } from './schemas';

export interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface InvoiceSummary {
  id: number;
  orgId: number;
  customerId: number;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  supplyType: SupplyType;
  sellerStateCode: string | null;
  sellerGstin: string | null;
  buyerStateCode: string | null;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  amountPaidPaise: number;
  notes: string | null;
  createdAt: string;
}

export interface Invoice extends InvoiceSummary {
  items: InvoiceItem[];
}

export type NewInvoiceItem = Omit<InvoiceItem, 'id'>;

export interface NewInvoice {
  customerId: number;
  dueDate: string | null;
  notes: string | null;
  supplyType: SupplyType;
  sellerStateCode: string | null;
  sellerGstin: string | null;
  buyerStateCode: string | null;
  items: NewInvoiceItem[];
  totals: InvoiceTotals;
}

export interface InvoiceListOptions {
  limit: number;
  offset: number;
  status?: InvoiceStatus | undefined;
  customerId?: number | undefined;
}

export interface Parties {
  sellerStateCode: string | null;
  sellerGstin: string | null;
  buyerStateCode: string | null;
}

export type IssueResult =
  { kind: 'not_found' } | { kind: 'not_draft' } | { kind: 'issued'; invoice: Invoice };

export type CancelResult =
  { kind: 'not_found' } | { kind: 'not_cancellable' } | { kind: 'cancelled'; invoice: Invoice };

/** Totals for the dashboard. Cancelled and draft invoices are counted but never add to the money. */
export interface DashboardSummary {
  invoiceCounts: Record<InvoiceStatus, number>;
  /** Total of issued, partially paid and paid invoices. */
  billedPaise: number;
  receivedPaise: number;
  outstandingPaise: number;
  /** Issued or partially paid invoices whose due date is before today. */
  overdueCount: number;
  overduePaise: number;
}

/** Every method takes orgId first and uses it in every query. */
export interface InvoiceRepository {
  /** State codes of the seller (our organization) and the buyer. null = customer not in this org. */
  findParties(orgId: number, customerId: number): Promise<Parties | null>;
  createDraft(orgId: number, input: NewInvoice): Promise<Invoice>;
  list(
    orgId: number,
    options: InvoiceListOptions,
  ): Promise<{ items: InvoiceSummary[]; total: number }>;
  findById(orgId: number, id: number): Promise<Invoice | null>;
  issue(orgId: number, id: number, issueDate: string): Promise<IssueResult>;
  cancel(orgId: number, id: number): Promise<CancelResult>;
  /** today = India date as YYYY-MM-DD. */
  summarize(orgId: number, today: string): Promise<DashboardSummary>;
}

interface InvoiceRow extends RowDataPacket {
  id: number;
  org_id: number;
  customer_id: number;
  invoice_number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  supply_type: SupplyType;
  seller_state_code: string | null;
  seller_gstin: string | null;
  buyer_state_code: string | null;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  amount_paid_paise: number;
  notes: string | null;
  created_at: Date;
}

interface ItemRow extends RowDataPacket {
  id: number;
  description: string;
  quantity: number;
  unit_price_paise: number;
  gst_rate_bp: number;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
}

// DATE columns are formatted in SQL so no timezone shifting can happen in JavaScript.
const COLUMNS = `id, org_id, customer_id, invoice_number, status,
  DATE_FORMAT(issue_date, '%Y-%m-%d') AS issue_date,
  DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
  supply_type, seller_state_code, seller_gstin, buyer_state_code,
  subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, amount_paid_paise,
  notes, created_at`;

const ITEM_COLUMNS =
  'id, description, quantity, unit_price_paise, gst_rate_bp, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise';

function toSummary(row: InvoiceRow): InvoiceSummary {
  return {
    id: row.id,
    orgId: row.org_id,
    customerId: row.customer_id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    supplyType: row.supply_type,
    sellerStateCode: row.seller_state_code,
    sellerGstin: row.seller_gstin,
    buyerStateCode: row.buyer_state_code,
    subtotalPaise: Number(row.subtotal_paise),
    cgstPaise: Number(row.cgst_paise),
    sgstPaise: Number(row.sgst_paise),
    igstPaise: Number(row.igst_paise),
    totalPaise: Number(row.total_paise),
    amountPaidPaise: Number(row.amount_paid_paise),
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
  };
}

function toItem(row: ItemRow): InvoiceItem {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unitPricePaise: Number(row.unit_price_paise),
    gstRateBp: row.gst_rate_bp,
    taxablePaise: Number(row.taxable_paise),
    cgstPaise: Number(row.cgst_paise),
    sgstPaise: Number(row.sgst_paise),
    igstPaise: Number(row.igst_paise),
    totalPaise: Number(row.total_paise),
  };
}

async function findById(orgId: number, id: number): Promise<Invoice | null> {
  const [rows] = await pool.execute<InvoiceRow[]>(
    `SELECT ${COLUMNS} FROM invoices WHERE id = ? AND org_id = ? LIMIT 1`,
    [id, orgId],
  );
  const row = rows[0];
  if (!row) return null;
  const [items] = await pool.execute<ItemRow[]>(
    `SELECT ${ITEM_COLUMNS} FROM invoice_items WHERE invoice_id = ? AND org_id = ? ORDER BY id`,
    [id, orgId],
  );
  return { ...toSummary(row), items: items.map(toItem) };
}

export const mysqlInvoiceRepository: InvoiceRepository = {
  async findParties(orgId, customerId) {
    const [rows] = await pool.execute<
      (RowDataPacket & {
        seller: string | null;
        seller_gstin: string | null;
        buyer: string | null;
      })[]
    >(
      `SELECT o.state_code AS seller, o.gstin AS seller_gstin, c.state_code AS buyer
         FROM customers c JOIN organizations o ON o.id = c.org_id
        WHERE c.id = ? AND c.org_id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [customerId, orgId],
    );
    const row = rows[0];
    return row
      ? { sellerStateCode: row.seller, sellerGstin: row.seller_gstin, buyerStateCode: row.buyer }
      : null;
  },

  // Invoice + all its items are saved in ONE transaction: all of it, or none of it.
  async createDraft(orgId, input) {
    const conn = await pool.getConnection();
    let invoiceId: number;
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO invoices
           (org_id, customer_id, status, due_date, supply_type, seller_state_code, seller_gstin, buyer_state_code,
            subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, notes)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orgId,
          input.customerId,
          input.dueDate,
          input.supplyType,
          input.sellerStateCode,
          input.sellerGstin,
          input.buyerStateCode,
          input.totals.subtotalPaise,
          input.totals.cgstPaise,
          input.totals.sgstPaise,
          input.totals.igstPaise,
          input.totals.totalPaise,
          input.notes,
        ],
      );
      invoiceId = result.insertId;
      const itemRows = input.items.map((item) => [
        orgId,
        invoiceId,
        item.description,
        item.quantity,
        item.unitPricePaise,
        item.gstRateBp,
        item.taxablePaise,
        item.cgstPaise,
        item.sgstPaise,
        item.igstPaise,
        item.totalPaise,
      ]);
      await conn.query(
        `INSERT INTO invoice_items
           (org_id, invoice_id, description, quantity, unit_price_paise, gst_rate_bp,
            taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
         VALUES ?`,
        [itemRows],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    const created = await findById(orgId, invoiceId);
    if (!created) throw new Error('Invoice vanished right after insert');
    return created;
  },

  async list(orgId, { limit, offset, status, customerId }) {
    const where = ['org_id = ?'];
    const params: (string | number)[] = [orgId];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (customerId) {
      where.push('customer_id = ?');
      params.push(customerId);
    }
    const whereSql = where.join(' AND ');

    const [rows] = await pool.query<InvoiceRow[]>(
      `SELECT ${COLUMNS} FROM invoices WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [counts] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM invoices WHERE ${whereSql}`,
      params,
    );
    return { items: rows.map(toSummary), total: Number(counts[0]?.total ?? 0) };
  },

  findById,

  async summarize(orgId, today) {
    const [rows] = await pool.execute<(RowDataPacket & Record<string, string | number>)[]>(
      `SELECT
         COALESCE(SUM(status = 'draft'), 0) AS draft_count,
         COALESCE(SUM(status = 'issued'), 0) AS issued_count,
         COALESCE(SUM(status = 'partially_paid'), 0) AS partially_paid_count,
         COALESCE(SUM(status = 'paid'), 0) AS paid_count,
         COALESCE(SUM(status = 'cancelled'), 0) AS cancelled_count,
         COALESCE(SUM(CASE WHEN status IN ('issued', 'partially_paid', 'paid')
                           THEN total_paise END), 0) AS billed_paise,
         COALESCE(SUM(CASE WHEN status IN ('issued', 'partially_paid', 'paid')
                           THEN amount_paid_paise END), 0) AS received_paise,
         COALESCE(SUM(CASE WHEN status IN ('issued', 'partially_paid')
                            AND due_date IS NOT NULL AND due_date < ? THEN 1 END), 0) AS overdue_count,
         COALESCE(SUM(CASE WHEN status IN ('issued', 'partially_paid')
                            AND due_date IS NOT NULL AND due_date < ?
                           THEN total_paise - amount_paid_paise END), 0) AS overdue_paise
         FROM invoices
        WHERE org_id = ?`,
      [today, today, orgId],
    );
    const row = rows[0];
    const n = (key: string): number => Number(row?.[key] ?? 0);
    const billedPaise = n('billed_paise');
    const receivedPaise = n('received_paise');
    return {
      invoiceCounts: {
        draft: n('draft_count'),
        issued: n('issued_count'),
        partially_paid: n('partially_paid_count'),
        paid: n('paid_count'),
        cancelled: n('cancelled_count'),
      },
      billedPaise,
      receivedPaise,
      outstandingPaise: billedPaise - receivedPaise,
      overdueCount: n('overdue_count'),
      overduePaise: n('overdue_paise'),
    };
  },

  // The invoice row is locked, the counter is bumped and the number is saved in ONE transaction.
  // Two people issuing at the same moment can never get the same number.
  async issue(orgId, id, issueDate) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute<(RowDataPacket & { status: InvoiceStatus })[]>(
        `SELECT status FROM invoices WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE`,
        [id, orgId],
      );
      const row = rows[0];
      if (!row) {
        await conn.rollback();
        return { kind: 'not_found' };
      }
      if (row.status !== 'draft') {
        await conn.rollback();
        return { kind: 'not_draft' };
      }

      const fiscalYear = fiscalYearOf(issueDate);
      await conn.execute(
        `INSERT INTO invoice_counters (org_id, fiscal_year, last_number) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
        [orgId, fiscalYear],
      );
      const [counters] = await conn.execute<(RowDataPacket & { last_number: number })[]>(
        `SELECT last_number FROM invoice_counters WHERE org_id = ? AND fiscal_year = ?`,
        [orgId, fiscalYear],
      );
      const sequence = counters[0]?.last_number;
      if (!sequence) throw new Error('Invoice counter missing after update');

      await conn.execute(
        `UPDATE invoices SET invoice_number = ?, status = 'issued', issue_date = ?
          WHERE id = ? AND org_id = ?`,
        [formatInvoiceNumber(fiscalYear, sequence), issueDate, id, orgId],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    const invoice = await findById(orgId, id);
    if (!invoice) throw new Error('Invoice vanished after issue');
    return { kind: 'issued', invoice };
  },

  // One atomic UPDATE: only a draft, or an issued invoice with no payment, can be cancelled.
  async cancel(orgId, id) {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE invoices SET status = 'cancelled'
        WHERE id = ? AND org_id = ? AND status IN ('draft', 'issued') AND amount_paid_paise = 0`,
      [id, orgId],
    );
    const invoice = await findById(orgId, id);
    if (!invoice) return { kind: 'not_found' };
    if (result.affectedRows === 0) return { kind: 'not_cancellable' };
    return { kind: 'cancelled', invoice };
  },
};
