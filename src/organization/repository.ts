import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';

export interface Organization {
  id: number;
  name: string;
  gstin: string | null;
  stateCode: string | null;
}

/** The organization id always comes from the verified token, never from the client. */
export interface OrganizationRepository {
  findById(orgId: number): Promise<Organization | null>;
  updateGst(
    orgId: number,
    gstin: string | null,
    stateCode: string | null,
  ): Promise<Organization | null>;
}

interface OrganizationRow extends RowDataPacket {
  id: number;
  name: string;
  gstin: string | null;
  state_code: string | null;
}

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: Number(row.id),
    name: row.name,
    gstin: row.gstin,
    stateCode: row.state_code,
  };
}

export const mysqlOrganizationRepository: OrganizationRepository = {
  async findById(orgId) {
    const [rows] = await pool.query<OrganizationRow[]>(
      'SELECT id, name, gstin, state_code FROM organizations WHERE id = ?',
      [orgId],
    );
    return rows[0] ? toOrganization(rows[0]) : null;
  },

  async updateGst(orgId, gstin, stateCode) {
    await pool.query('UPDATE organizations SET gstin = ?, state_code = ? WHERE id = ?', [
      gstin,
      stateCode,
      orgId,
    ]);
    return this.findById(orgId);
  },
};
