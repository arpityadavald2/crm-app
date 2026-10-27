import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';

export interface Customer {
  id: number;
  orgId: number;
  name: string;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  billingAddress: string | null;
  stateCode: string | null;
  createdAt: string;
}

export interface CustomerInput {
  name: string;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  billingAddress: string | null;
  stateCode: string | null;
}

export type CustomerPatch = Partial<CustomerInput>;

export interface ListOptions {
  limit: number;
  offset: number;
  search?: string | undefined;
}

/**
 * Every method takes orgId as its FIRST argument and uses it in every query.
 * There is deliberately no way to read a customer without saying which organization asks.
 */
export interface CustomerRepository {
  create(orgId: number, input: CustomerInput): Promise<Customer>;
  list(orgId: number, options: ListOptions): Promise<{ items: Customer[]; total: number }>;
  findById(orgId: number, id: number): Promise<Customer | null>;
  update(orgId: number, id: number, patch: CustomerPatch): Promise<Customer | null>;
  softDelete(orgId: number, id: number): Promise<boolean>;
}

interface CustomerRow extends RowDataPacket {
  id: number;
  org_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  billing_address: string | null;
  state_code: string | null;
  created_at: Date;
}

const COLUMNS = 'id, org_id, name, email, phone, gstin, billing_address, state_code, created_at';
const LIVE = 'deleted_at IS NULL';

// Column names come from this fixed map, never from user input, so there is no SQL injection here.
const COLUMN_FOR: Record<keyof CustomerInput, string> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  gstin: 'gstin',
  billingAddress: 'billing_address',
  stateCode: 'state_code',
};

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    gstin: row.gstin,
    billingAddress: row.billing_address,
    stateCode: row.state_code,
    createdAt: row.created_at.toISOString(),
  };
}

// Make % and _ in a search term mean themselves, not "match anything".
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

async function findById(orgId: number, id: number): Promise<Customer | null> {
  const [rows] = await pool.execute<CustomerRow[]>(
    `SELECT ${COLUMNS} FROM customers WHERE id = ? AND org_id = ? AND ${LIVE} LIMIT 1`,
    [id, orgId],
  );
  const row = rows[0];
  return row ? toCustomer(row) : null;
}

export const mysqlCustomerRepository: CustomerRepository = {
  async create(orgId, input) {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO customers (org_id, name, email, phone, gstin, billing_address, state_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        input.name,
        input.email,
        input.phone,
        input.gstin,
        input.billingAddress,
        input.stateCode,
      ],
    );
    const created = await findById(orgId, result.insertId);
    if (!created) throw new Error('Customer vanished right after insert');
    return created;
  },

  async list(orgId, { limit, offset, search }) {
    const where = ['org_id = ?', LIVE];
    const params: (string | number)[] = [orgId];
    if (search) {
      where.push('name LIKE ?');
      params.push(`%${escapeLike(search)}%`);
    }
    const whereSql = where.join(' AND ');

    const [rows] = await pool.query<CustomerRow[]>(
      `SELECT ${COLUMNS} FROM customers WHERE ${whereSql} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [counts] = await pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM customers WHERE ${whereSql}`,
      params,
    );
    return { items: rows.map(toCustomer), total: Number(counts[0]?.total ?? 0) };
  },

  findById,

  async update(orgId, id, patch) {
    const sets: string[] = [];
    const values: (string | null)[] = [];
    for (const key of Object.keys(COLUMN_FOR) as (keyof CustomerInput)[]) {
      const value = patch[key];
      if (value !== undefined) {
        sets.push(`${COLUMN_FOR[key]} = ?`);
        values.push(value);
      }
    }
    if (sets.length > 0) {
      await pool.execute(
        `UPDATE customers SET ${sets.join(', ')} WHERE id = ? AND org_id = ? AND ${LIVE}`,
        [...values, id, orgId],
      );
    }
    return findById(orgId, id);
  },

  async softDelete(orgId, id) {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND org_id = ? AND ${LIVE}`,
      [id, orgId],
    );
    return result.affectedRows > 0;
  },
};
