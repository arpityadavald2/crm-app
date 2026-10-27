import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { mysqlCustomerRepository, type Customer } from '../customers/repository';
import { pool } from '../db/pool';
import type { LeadStatus } from './schemas';

export interface Lead {
  id: number;
  orgId: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  customerId: number | null;
  createdAt: string;
}

export interface LeadInput {
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
}

export type LeadPatch = Partial<LeadInput>;

export interface LeadListOptions {
  limit: number;
  offset: number;
  search?: string | undefined;
  status?: LeadStatus | undefined;
}

export type ConvertResult =
  | { kind: 'not_found' }
  | { kind: 'already_converted' }
  | { kind: 'converted'; lead: Lead; customer: Customer };

/** Every method takes orgId first and uses it in every query. */
export interface LeadRepository {
  create(orgId: number, input: LeadInput): Promise<Lead>;
  list(orgId: number, options: LeadListOptions): Promise<{ items: Lead[]; total: number }>;
  findById(orgId: number, id: number): Promise<Lead | null>;
  update(orgId: number, id: number, patch: LeadPatch): Promise<Lead | null>;
  softDelete(orgId: number, id: number): Promise<boolean>;
  convert(orgId: number, id: number): Promise<ConvertResult>;
}

interface LeadRow extends RowDataPacket {
  id: number;
  org_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  customer_id: number | null;
  created_at: Date;
}

const COLUMNS = 'id, org_id, name, email, phone, source, status, notes, customer_id, created_at';
const LIVE = 'deleted_at IS NULL';

// Column names come from this fixed map, never from user input.
const COLUMN_FOR: Record<keyof LeadInput, string> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  source: 'source',
  status: 'status',
  notes: 'notes',
};

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    notes: row.notes,
    customerId: row.customer_id,
    createdAt: row.created_at.toISOString(),
  };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

async function findById(orgId: number, id: number): Promise<Lead | null> {
  const [rows] = await pool.execute<LeadRow[]>(
    `SELECT ${COLUMNS} FROM leads WHERE id = ? AND org_id = ? AND ${LIVE} LIMIT 1`,
    [id, orgId],
  );
  const row = rows[0];
  return row ? toLead(row) : null;
}

export const mysqlLeadRepository: LeadRepository = {
  async create(orgId, input) {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO leads (org_id, name, email, phone, source, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orgId, input.name, input.email, input.phone, input.source, input.status, input.notes],
    );
    const created = await findById(orgId, result.insertId);
    if (!created) throw new Error('Lead vanished right after insert');
    return created;
  },

  async list(orgId, { limit, offset, search, status }) {
    const where = ['org_id = ?', LIVE];
    const params: (string | number)[] = [orgId];
    if (search) {
      where.push('name LIKE ?');
      params.push(`%${escapeLike(search)}%`);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const whereSql = where.join(' AND ');

    const [rows] = await pool.query<LeadRow[]>(
      `SELECT ${COLUMNS} FROM leads WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [counts] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM leads WHERE ${whereSql}`,
      params,
    );
    return { items: rows.map(toLead), total: Number(counts[0]?.total ?? 0) };
  },

  findById,

  async update(orgId, id, patch) {
    const sets: string[] = [];
    const values: (string | null)[] = [];
    for (const key of Object.keys(COLUMN_FOR) as (keyof LeadInput)[]) {
      const value = patch[key];
      if (value !== undefined) {
        sets.push(`${COLUMN_FOR[key]} = ?`);
        values.push(value);
      }
    }
    if (sets.length > 0) {
      await pool.execute(
        `UPDATE leads SET ${sets.join(', ')} WHERE id = ? AND org_id = ? AND ${LIVE}`,
        [...values, id, orgId],
      );
    }
    return findById(orgId, id);
  },

  async softDelete(orgId, id) {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE leads SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ? AND ${LIVE}`,
      [id, orgId],
    );
    return result.affectedRows > 0;
  },

  // Customer insert + lead update happen in ONE transaction: both succeed or neither does.
  async convert(orgId, id) {
    const conn = await pool.getConnection();
    let customerId: number;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute<LeadRow[]>(
        `SELECT ${COLUMNS} FROM leads WHERE id = ? AND org_id = ? AND ${LIVE} LIMIT 1 FOR UPDATE`,
        [id, orgId],
      );
      const lead = rows[0];
      if (!lead) {
        await conn.rollback();
        return { kind: 'not_found' };
      }
      if (lead.customer_id !== null) {
        await conn.rollback();
        return { kind: 'already_converted' };
      }
      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO customers (org_id, name, email, phone) VALUES (?, ?, ?, ?)`,
        [orgId, lead.name, lead.email, lead.phone],
      );
      customerId = inserted.insertId;
      await conn.execute(
        `UPDATE leads SET status = 'won', customer_id = ? WHERE id = ? AND org_id = ?`,
        [customerId, id, orgId],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const lead = await findById(orgId, id);
    const customer = await mysqlCustomerRepository.findById(orgId, customerId);
    if (!lead || !customer) throw new Error('Converted records vanished');
    return { kind: 'converted', lead, customer };
  },
};
