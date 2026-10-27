import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';

export interface OverdueInvoice {
  orgId: number;
  invoiceId: number;
  invoiceNumber: string | null;
  dueDate: string;
  balancePaise: number;
  daysOverdue: number;
}

/**
 * DELIBERATE EXCEPTION to "orgId is the first argument": this is a system job (no user, no JWT),
 * so it looks at every organization. Every row carries its orgId, and the result is only used
 * for logging / notifying that same organization. It is never returned from an API.
 */
export interface ReminderRepository {
  findOverdue(today: string): Promise<OverdueInvoice[]>;
}

interface OverdueRow extends RowDataPacket {
  id: number;
  org_id: number;
  invoice_number: string | null;
  due_date: string;
  balance_paise: number;
  days_overdue: number;
}

// Safety cap per run so one huge backlog cannot flood the worker.
const MAX_PER_RUN = 1000;

export const mysqlReminderRepository: ReminderRepository = {
  async findOverdue(today) {
    const [rows] = await pool.execute<OverdueRow[]>(
      `SELECT id, org_id, invoice_number,
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
              total_paise - amount_paid_paise AS balance_paise,
              DATEDIFF(?, due_date) AS days_overdue
         FROM invoices
        WHERE status IN ('issued', 'partially_paid')
          AND due_date IS NOT NULL
          AND due_date < ?
        ORDER BY org_id, due_date, id
        LIMIT ${MAX_PER_RUN}`,
      [today, today],
    );
    return rows.map((row) => ({
      orgId: Number(row.org_id),
      invoiceId: Number(row.id),
      invoiceNumber: row.invoice_number,
      dueDate: row.due_date,
      balancePaise: Number(row.balance_paise),
      daysOverdue: Number(row.days_overdue),
    }));
  },
};
