import type {
  Customer,
  CustomerInput,
  CustomerPatch,
  CustomerRepository,
  ListOptions,
} from '../../src/customers/repository';

/** A fake "database" with the same org_id and soft-delete rules as the MySQL one. */
export class InMemoryCustomerRepository implements CustomerRepository {
  private rows: (Customer & { deleted: boolean })[] = [];
  private nextId = 1;

  private live(orgId: number) {
    return this.rows.filter((row) => row.orgId === orgId && !row.deleted);
  }

  async create(orgId: number, input: CustomerInput): Promise<Customer> {
    const row = {
      id: this.nextId++,
      orgId,
      ...input,
      createdAt: new Date().toISOString(),
      deleted: false,
    };
    this.rows.push(row);
    return this.strip(row);
  }

  async list(orgId: number, { limit, offset, search }: ListOptions) {
    const matches = this.live(orgId)
      .filter((row) => !search || row.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return {
      items: matches.slice(offset, offset + limit).map((row) => this.strip(row)),
      total: matches.length,
    };
  }

  async findById(orgId: number, id: number): Promise<Customer | null> {
    const row = this.live(orgId).find((r) => r.id === id);
    return row ? this.strip(row) : null;
  }

  async update(orgId: number, id: number, patch: CustomerPatch): Promise<Customer | null> {
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

  private strip(row: Customer & { deleted: boolean }): Customer {
    const { deleted: _deleted, ...customer } = row;
    return customer;
  }
}
