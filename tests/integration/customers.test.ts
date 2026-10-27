import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { signAccessToken, type Role } from '../../src/auth/tokens';
import { InMemoryCustomerRepository } from '../helpers/in-memory-customers';

const ORG_A = 1;
const ORG_B = 2;

const bearer = (orgId: number, role: Role = 'owner') => ({
  Authorization: `Bearer ${signAccessToken({ userId: orgId * 10, orgId, role })}`,
});

let app: express.Express;

beforeEach(() => {
  app = createApp({ customerRepository: new InMemoryCustomerRepository() });
});

describe('customers: access', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/customers');
    expect(res.status).toBe(401);
  });
});

describe('customers: create and read', () => {
  it('creates a customer and reads it back', async () => {
    const created = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Sharma Traders', email: 'Sharma@Example.com', phone: '+91 98765 43210' });
    expect(created.status).toBe(201);
    expect(created.body.customer.orgId).toBe(ORG_A);
    expect(created.body.customer.email).toBe('sharma@example.com');

    const fetched = await request(app)
      .get(`/customers/${created.body.customer.id}`)
      .set(bearer(ORG_A));
    expect(fetched.status).toBe(200);
    expect(fetched.body.customer.name).toBe('Sharma Traders');
  });

  it('ignores an orgId sent in the body (it always comes from the token)', async () => {
    const created = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Sneaky Client', orgId: ORG_B });
    expect(created.status).toBe(201);
    expect(created.body.customer.orgId).toBe(ORG_A);
  });

  it('rejects a badly formatted GSTIN and names the field', async () => {
    const res = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Bad Gstin Co', gstin: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('gstin');
  });

  it('takes the state code from the GSTIN', async () => {
    const res = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Bengaluru Supplies', gstin: '29abcde1234f1z5' });
    expect(res.status).toBe(201);
    expect(res.body.customer.gstin).toBe('29ABCDE1234F1Z5');
    expect(res.body.customer.stateCode).toBe('29');
  });
});

describe('customers: list', () => {
  it('searches by name and paginates', async () => {
    for (const name of ['Alpha Traders', 'Beta Stores', 'Alpha Logistics']) {
      await request(app).post('/customers').set(bearer(ORG_A)).send({ name });
    }

    const search = await request(app).get('/customers?search=alpha').set(bearer(ORG_A));
    expect(search.body.total).toBe(2);

    const page2 = await request(app).get('/customers?limit=1&page=2').set(bearer(ORG_A));
    expect(page2.body.total).toBe(3);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].name).toBe('Alpha Traders');
  });
});

describe('customers: tenant isolation', () => {
  it("never lets one organization see or change another's customer", async () => {
    const created = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Secret Client' });
    const id = created.body.customer.id;

    const read = await request(app).get(`/customers/${id}`).set(bearer(ORG_B));
    expect(read.status).toBe(404);

    const edit = await request(app)
      .patch(`/customers/${id}`)
      .set(bearer(ORG_B))
      .send({ name: 'Hacked' });
    expect(edit.status).toBe(404);

    const remove = await request(app).delete(`/customers/${id}`).set(bearer(ORG_B));
    expect(remove.status).toBe(404);

    const listB = await request(app).get('/customers').set(bearer(ORG_B));
    expect(listB.body.total).toBe(0);

    const stillThere = await request(app).get(`/customers/${id}`).set(bearer(ORG_A));
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.customer.name).toBe('Secret Client');
  });
});

describe('customers: update and delete', () => {
  it('updates fields, and null clears a field', async () => {
    const created = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Old Name', phone: '9876543210' });
    const id = created.body.customer.id;

    const res = await request(app)
      .patch(`/customers/${id}`)
      .set(bearer(ORG_A))
      .send({ name: 'New Name', phone: null });
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('New Name');
    expect(res.body.customer.phone).toBeNull();
  });

  it('lets only the owner delete, and a deleted customer disappears', async () => {
    const created = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'To Delete' });
    const id = created.body.customer.id;

    const byAccountant = await request(app)
      .delete(`/customers/${id}`)
      .set(bearer(ORG_A, 'accountant'));
    expect(byAccountant.status).toBe(403);

    const byOwner = await request(app).delete(`/customers/${id}`).set(bearer(ORG_A, 'owner'));
    expect(byOwner.status).toBe(204);

    const after = await request(app).get(`/customers/${id}`).set(bearer(ORG_A));
    expect(after.status).toBe(404);
  });
});

describe('customers: roles', () => {
  it('does not let accountant or sales delete a customer', async () => {
    const created = await request(app)
      .post('/customers')
      .set(bearer(ORG_A))
      .send({ name: 'Role Test Co' });
    for (const role of ['accountant', 'sales'] as const) {
      const res = await request(app)
        .delete(`/customers/${created.body.customer.id}`)
        .set(bearer(ORG_A, role));
      expect(res.status).toBe(403);
    }
  });
});
