import type { InMemoryCustomerRepository } from './in-memory-customers';
import type {
  ConvertResult,
  Lead,
  LeadInput,
  LeadListOptions,
  LeadPatch,
  LeadRepository,
} from '../../src/leads/repository';

type Row = Lead & { deleted: boolean };

/** A fake "database" with the same org_id and soft-delete rules as the MySQL one. */
export class InMemoryLeadRepository implements LeadRepository {
  private rows: Row[] = [];
  private nextId = 1;

  constructor(private readonly customers: InMemoryCustomerRepository) {}

  private live(orgId: number): Row[] {
    return this.rows.filter((row) => row.orgId === orgId && !row.deleted);
  }

  async create(orgId: number, input: LeadInput): Promise<Lead> {
    const row: Row = {
      id: this.nextId++,
      orgId,
      ...input,
      customerId: null,
      createdAt: new Date().toISOString(),
      deleted: false,
    };
    this.rows.push(row);
    return this.strip(row);
  }

  async list(orgId: number, { limit, offset, search, status }: LeadListOptions) {
    const matches = this.live(orgId)
      .filter((row) => !search || row.name.toLowerCase().includes(search.toLowerCase()))
      .filter((row) => !status || row.status === status)
      .sort((a, b) => b.id - a.id);
    return {
      items: matches.slice(offset, offset + limit).map((row) => this.strip(row)),
      total: matches.length,
    };
  }

  async findById(orgId: number, id: number): Promise<Lead | null> {
    const row = this.live(orgId).find((r) => r.id === id);
    return row ? this.strip(row) : null;
  }

  async update(orgId: number, id: number, patch: LeadPatch): Promise<Lead | null> {
    const row = this.live(orgId).find((r) => r.id === id);
    if (!row) return null;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(row, { [key]: value });
    }
    return this.strip(row);
  }

  async softDelete(orgId: number, id: number): Promise<boolean> {
    const row = this.live(orgId).find((r) => r.id === id);
    if (!row) return false;
    row.deleted = true;
    return true;
  }

  async convert(orgId: number, id: number): Promise<ConvertResult> {
    const row = this.live(orgId).find((r) => r.id === id);
    if (!row) return { kind: 'not_found' };
    if (row.customerId !== null) return { kind: 'already_converted' };
    const customer = await this.customers.create(orgId, {
      name: row.name,
      email: row.email,
      phone: row.phone,
      gstin: null,
      billingAddress: null,
      stateCode: null,
    });
    row.status = 'won';
    row.customerId = customer.id;
    return { kind: 'converted', lead: this.strip(row), customer };
  }

  private strip(row: Row): Lead {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { deleted: _deleted, ...lead } = row;
    return lead;
  }
}
