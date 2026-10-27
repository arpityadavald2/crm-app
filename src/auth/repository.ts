import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import type { Role } from './tokens';

export interface UserRecord {
  id: number;
  orgId: number;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export interface NewOwnerInput {
  organizationName: string;
  fullName: string;
  email: string;
  passwordHash: string;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'DuplicateEmailError';
  }
}

/** The routes only know this interface, so tests can plug in a fake without MySQL. */
export interface AuthRepository {
  createOrganizationWithOwner(input: NewOwnerInput): Promise<{ orgId: number; userId: number }>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: number): Promise<UserRecord | null>;
}

interface UserRow extends RowDataPacket {
  id: number;
  org_id: number;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  is_active: number;
}

const USER_COLUMNS = 'id, org_id, email, password_hash, full_name, role, is_active';

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active === 1,
  };
}

function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY'
  );
}

export const mysqlAuthRepository: AuthRepository = {
  async createOrganizationWithOwner(input) {
    const connection = await pool.getConnection();
    try {
      // One transaction: either the organization AND its owner exist, or neither does.
      await connection.beginTransaction();
      const [org] = await connection.execute<ResultSetHeader>(
        'INSERT INTO organizations (name) VALUES (?)',
        [input.organizationName],
      );
      const [user] = await connection.execute<ResultSetHeader>(
        'INSERT INTO users (org_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
        [org.insertId, input.email, input.passwordHash, input.fullName, 'owner'],
      );
      await connection.commit();
      return { orgId: org.insertId, userId: user.insertId };
    } catch (error) {
      await connection.rollback();
      if (isDuplicateEntry(error)) throw new DuplicateEmailError();
      throw error;
    } finally {
      connection.release();
    }
  },

  async findUserByEmail(email) {
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  },

  async findUserById(id) {
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  },
};
