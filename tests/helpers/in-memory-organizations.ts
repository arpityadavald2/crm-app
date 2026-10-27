import type { Organization, OrganizationRepository } from '../../src/organization/repository';

/** A fake "database" of organizations. Same contract as the MySQL one. */
export class InMemoryOrganizationRepository implements OrganizationRepository {
  private rows = new Map<number, Organization>();

  constructor(orgs: Organization[] = []) {
    for (const org of orgs) this.rows.set(org.id, { ...org });
  }

  async findById(orgId: number): Promise<Organization | null> {
    const org = this.rows.get(orgId);
    return org ? { ...org } : null;
  }

  async updateGst(
    orgId: number,
    gstin: string | null,
    stateCode: string | null,
  ): Promise<Organization | null> {
    const org = this.rows.get(orgId);
    if (!org) return null;
    org.gstin = gstin;
    org.stateCode = stateCode;
    return { ...org };
  }
}
