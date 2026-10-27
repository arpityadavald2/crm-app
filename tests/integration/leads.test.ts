import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { signAccessToken, type Role } from '../../src/auth/tokens';
import { InMemoryCustomerRepository } from '../helpers/in-memory-customers';

import { InMemoryLeadRepository } from '../helpers/in-memory-leads';

const ORG_A = 1;
const ORG_B = 2;

const bearer = (orgId: number, role: Role = 'owner') => ({
  Authorization: `Bearer ${signAccessToken({ userId: orgId * 10, orgId, role })}`,
});

let app: express.Express;

beforeEach(() => {
  const customers = new InMemoryCustomerRepository();
  app = createApp({
    customerRepository: customers,
    leadRepository: new InMemoryLeadRepository(customers),
  });
});

async function createLead(orgId: number, body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/leads')
    .set(bearer(orgId))
    .send({ name: 'Verma Enterprises', phone: '+91 91234 56789', ...body });
  return res.body.lead as { id: number; status: string; customerId: number | null };
}

describe('leads: access and create', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/leads');
    expect(res.status).toBe(401);
  });

  it('creates a lead with status "new" and reads it back', async () => {
    const res = await request(app)
      .post('/leads')
      .set(bearer(ORG_A))
      .send({ name: 'Verma Enterprises', email: 'Verma@Example.com', source: 'website' });
    expect(res.status).toBe(201);
    expect(res.body.lead.status).toBe('new');
    expect(res.body.lead.email).toBe('verma@example.com');

    const fetched = await request(app).get(`/leads/${res.body.lead.id}`).set(bearer(ORG_A));
    expect(fetched.status).toBe(200);
    expect(fetched.body.lead.source).toBe('website');
  });

  it('ignores orgId and customerId sent in the body', async () => {
    const res = await request(app)
      .post('/leads')
      .set(bearer(ORG_A))
      .send({ name: 'Sneaky Lead', orgId: ORG_B, customerId: 99 });
    expect(res.status).toBe(201);
    expect(res.body.lead.orgId).toBe(ORG_A);
    expect(res.body.lead.customerId).toBeNull();
  });

  it('rejects an unknown status', async () => {
    const res = await request(app)
      .post('/leads')
      .set(bearer(ORG_A))
      .send({ name: 'Bad Status', status: 'banana' });
    expect(res.status).toBe(400);
  });
});

describe('leads: organization isolation', () => {
  it('does not let another organization read, change or delete a lead', async () => {
    const lead = await createLead(ORG_A);

    const read = await request(app).get(`/leads/${lead.id}`).set(bearer(ORG_B));
    expect(read.status).toBe(404);

    const patch = await request(app)
      .patch(`/leads/${lead.id}`)
      .set(bearer(ORG_B))
      .send({ status: 'lost' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/leads/${lead.id}`).set(bearer(ORG_B));
    expect(del.status).toBe(404);

    const list = await request(app).get('/leads').set(bearer(ORG_B));
    expect(list.body.total).toBe(0);
  });
});

describe('leads: update and filter', () => {
  it('changes status and filters the list by status', async () => {
    const lead = await createLead(ORG_A, { name: 'Alpha Co' });
    await createLead(ORG_A, { name: 'Beta Co' });

    const patched = await request(app)
      .patch(`/leads/${lead.id}`)
      .set(bearer(ORG_A))
      .send({ status: 'qualified' });
    expect(patched.status).toBe(200);
    expect(patched.body.lead.status).toBe('qualified');

    const qualified = await request(app).get('/leads?status=qualified').set(bearer(ORG_A));
    expect(qualified.body.total).toBe(1);
    expect(qualified.body.items[0].name).toBe('Alpha Co');
  });

  it('rejects an empty update', async () => {
    const lead = await createLead(ORG_A);
    const res = await request(app).patch(`/leads/${lead.id}`).set(bearer(ORG_A)).send({});
    expect(res.status).toBe(400);
  });
});

describe('leads: convert to customer', () => {
  it('creates a customer, marks the lead won and links them', async () => {
    const lead = await createLead(ORG_A);

    const res = await request(app).post(`/leads/${lead.id}/convert`).set(bearer(ORG_A));
    expect(res.status).toBe(201);
    expect(res.body.lead.status).toBe('won');
    expect(res.body.lead.customerId).toBe(res.body.customer.id);
    expect(res.body.customer.orgId).toBe(ORG_A);
    expect(res.body.customer.name).toBe('Verma Enterprises');

    const customer = await request(app)
      .get(`/customers/${res.body.customer.id}`)
      .set(bearer(ORG_A));
    expect(customer.status).toBe(200);
  });

  it('refuses to convert the same lead twice', async () => {
    const lead = await createLead(ORG_A);
    await request(app).post(`/leads/${lead.id}/convert`).set(bearer(ORG_A));

    const again = await request(app).post(`/leads/${lead.id}/convert`).set(bearer(ORG_A));
    expect(again.status).toBe(409);
  });

  it('cannot convert a lead that belongs to another organization', async () => {
    const lead = await createLead(ORG_A);
    const res = await request(app).post(`/leads/${lead.id}/convert`).set(bearer(ORG_B));
    expect(res.status).toBe(404);
  });
});

describe('leads: delete', () => {
  it('soft-deletes for the owner, then the lead is gone', async () => {
    const lead = await createLead(ORG_A);
    const del = await request(app).delete(`/leads/${lead.id}`).set(bearer(ORG_A));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/leads/${lead.id}`).set(bearer(ORG_A));
    expect(after.status).toBe(404);
  });
});
