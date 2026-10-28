import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { signAccessToken, type Role } from '../../src/auth/tokens';
import { InMemoryCustomerRepository } from '../helpers/in-memory-customers';

import { InMemoryInvoiceRepository } from '../helpers/in-memory-invoices';

const ORG_A = 1;
const ORG_B = 2;

// Both seller organizations are in Punjab (state code 03).
const PUNJAB_GSTIN = '03ABCDE1234F1Z5';
const KARNATAKA_GSTIN = '29ABCDE1234F1Z5';

const bearer = (orgId: number, role: Role = 'owner') => ({
  Authorization: `Bearer ${signAccessToken({ userId: orgId * 10, orgId, role })}`,
});

let app: express.Express;

beforeEach(() => {
  const customers = new InMemoryCustomerRepository();
  app = createApp({
    customerRepository: customers,
    invoiceRepository: new InMemoryInvoiceRepository(
      customers,
      { [ORG_A]: '03', [ORG_B]: '03' },
      { [ORG_A]: PUNJAB_GSTIN, [ORG_B]: null },
    ),
  });
});

async function createCustomer(orgId: number, gstin?: string): Promise<number> {
  const res = await request(app)
    .post('/customers')
    .set(bearer(orgId))
    .send({ name: 'Sharma Traders', ...(gstin ? { gstin } : {}) });
  return res.body.customer.id as number;
}

const item = { description: 'Consulting', quantity: 2, unitPricePaise: 50000, gstRateBp: 1800 };

async function createInvoice(
  orgId: number,
  customerId: number,
  extra: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/invoices')
    .set(bearer(orgId))
    .send({ customerId, items: [item], ...extra });
  return res.body.invoice as { id: number; status: string; invoiceNumber: string | null };
}

describe('invoices: access and roles', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/invoices');
    expect(res.status).toBe(401);
  });

  it('lets sales read but not create, issue or cancel', async () => {
    const customerId = await createCustomer(ORG_A);
    const invoice = await createInvoice(ORG_A, customerId);

    const list = await request(app).get('/invoices').set(bearer(ORG_A, 'sales'));
    expect(list.status).toBe(200);

    const create = await request(app)
      .post('/invoices')
      .set(bearer(ORG_A, 'sales'))
      .send({ customerId, items: [item] });
    expect(create.status).toBe(403);

    const issue = await request(app)
      .post(`/invoices/${invoice.id}/issue`)
      .set(bearer(ORG_A, 'sales'));
    expect(issue.status).toBe(403);

    const cancel = await request(app)
      .post(`/invoices/${invoice.id}/cancel`)
      .set(bearer(ORG_A, 'sales'));
    expect(cancel.status).toBe(403);
  });
});

describe('invoices: create a draft', () => {
  it('uses CGST + SGST when seller and buyer are in the same state', async () => {
    const customerId = await createCustomer(ORG_A, PUNJAB_GSTIN);
    const res = await request(app)
      .post('/invoices')
      .set(bearer(ORG_A))
      .send({ customerId, items: [item] });
    expect(res.status).toBe(201);
    const { invoice } = res.body;
    expect(invoice.status).toBe('draft');
    expect(invoice.invoiceNumber).toBeNull();
    expect(invoice.supplyType).toBe('intra');
    expect(invoice.subtotalPaise).toBe(100000);
    expect(invoice.cgstPaise).toBe(9000);
    expect(invoice.sgstPaise).toBe(9000);
    expect(invoice.igstPaise).toBe(0);
    expect(invoice.totalPaise).toBe(118000);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.sellerStateCode).toBe('03');
    expect(invoice.sellerGstin).toBe(PUNJAB_GSTIN);
  });

  it('shows sellerGstin as null when the organization has no GSTIN set', async () => {
    const customerId = await createCustomer(ORG_B);
    const res = await request(app)
      .post('/invoices')
      .set(bearer(ORG_B))
      .send({ customerId, items: [item] });
    expect(res.status).toBe(201);
    expect(res.body.invoice.sellerGstin).toBeNull();
  });

  it('uses IGST when the buyer is in another state', async () => {
    const customerId = await createCustomer(ORG_A, KARNATAKA_GSTIN);
    const res = await request(app)
      .post('/invoices')
      .set(bearer(ORG_A))
      .send({ customerId, items: [item] });
    expect(res.body.invoice.supplyType).toBe('inter');
    expect(res.body.invoice.igstPaise).toBe(18000);
    expect(res.body.invoice.cgstPaise).toBe(0);
    expect(res.body.invoice.totalPaise).toBe(118000);
  });

  it('ignores totals, status and orgId sent by the client', async () => {
    const customerId = await createCustomer(ORG_A);
    const res = await request(app)
      .post('/invoices')
      .set(bearer(ORG_A))
      .send({
        customerId,
        items: [item],
        totalPaise: 1,
        status: 'paid',
        orgId: ORG_B,
        invoiceNumber: 'INV/HACK/0001',
      });
    expect(res.status).toBe(201);
    expect(res.body.invoice.totalPaise).toBe(118000);
    expect(res.body.invoice.status).toBe('draft');
    expect(res.body.invoice.orgId).toBe(ORG_A);
    expect(res.body.invoice.invoiceNumber).toBeNull();
  });

  it('rejects bad input', async () => {
    const customerId = await createCustomer(ORG_A);
    const post = (body: Record<string, unknown>) =>
      request(app).post('/invoices').set(bearer(ORG_A)).send(body);

    expect((await post({ customerId, items: [] })).status).toBe(400);
    expect((await post({ customerId, items: [{ ...item, gstRateBp: 1700 }] })).status).toBe(400);
    expect((await post({ customerId, items: [{ ...item, quantity: 0 }] })).status).toBe(400);
    expect((await post({ customerId, items: [{ ...item, unitPricePaise: 10.5 }] })).status).toBe(
      400,
    );
    expect((await post({ items: [item] })).status).toBe(400);
  });

  it('404s for an unknown customer, or one from another organization', async () => {
    const unknown = await request(app)
      .post('/invoices')
      .set(bearer(ORG_A))
      .send({ customerId: 999, items: [item] });
    expect(unknown.status).toBe(404);

    const otherOrgCustomer = await createCustomer(ORG_B);
    const crossOrg = await request(app)
      .post('/invoices')
      .set(bearer(ORG_A))
      .send({ customerId: otherOrgCustomer, items: [item] });
    expect(crossOrg.status).toBe(404);
  });
});

describe('invoices: organization isolation', () => {
  it('does not let another organization read, issue or cancel an invoice', async () => {
    const customerId = await createCustomer(ORG_A);
    const invoice = await createInvoice(ORG_A, customerId);

    expect((await request(app).get(`/invoices/${invoice.id}`).set(bearer(ORG_B))).status).toBe(404);
    expect(
      (await request(app).post(`/invoices/${invoice.id}/issue`).set(bearer(ORG_B))).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/invoices/${invoice.id}/cancel`).set(bearer(ORG_B))).status,
    ).toBe(404);

    const list = await request(app).get('/invoices').set(bearer(ORG_B));
    expect(list.body.total).toBe(0);
  });
});

describe('invoices: issue and numbering', () => {
  it('assigns sequential numbers per organization', async () => {
    const customerA = await createCustomer(ORG_A);
    const customerB = await createCustomer(ORG_B);
    const first = await createInvoice(ORG_A, customerA);
    const second = await createInvoice(ORG_A, customerA);
    const otherOrg = await createInvoice(ORG_B, customerB);

    const issued1 = await request(app).post(`/invoices/${first.id}/issue`).set(bearer(ORG_A));
    expect(issued1.status).toBe(200);
    expect(issued1.body.invoice.status).toBe('issued');
    expect(issued1.body.invoice.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/0001$/);
    expect(issued1.body.invoice.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const issued2 = await request(app).post(`/invoices/${second.id}/issue`).set(bearer(ORG_A));
    expect(issued2.body.invoice.invoiceNumber).toMatch(/\/0002$/);

    const issuedB = await request(app).post(`/invoices/${otherOrg.id}/issue`).set(bearer(ORG_B));
    expect(issuedB.body.invoice.invoiceNumber).toMatch(/\/0001$/);
  });

  it('refuses to issue the same invoice twice', async () => {
    const customerId = await createCustomer(ORG_A);
    const invoice = await createInvoice(ORG_A, customerId);
    await request(app).post(`/invoices/${invoice.id}/issue`).set(bearer(ORG_A));
    const again = await request(app).post(`/invoices/${invoice.id}/issue`).set(bearer(ORG_A));
    expect(again.status).toBe(409);
  });
});

describe('invoices: cancel', () => {
  it('cancels a draft', async () => {
    const customerId = await createCustomer(ORG_A);
    const invoice = await createInvoice(ORG_A, customerId);
    const res = await request(app).post(`/invoices/${invoice.id}/cancel`).set(bearer(ORG_A));
    expect(res.status).toBe(200);
    expect(res.body.invoice.status).toBe('cancelled');
  });

  it('keeps the invoice number when an issued invoice is cancelled', async () => {
    const customerId = await createCustomer(ORG_A);
    const invoice = await createInvoice(ORG_A, customerId);
    const issued = await request(app).post(`/invoices/${invoice.id}/issue`).set(bearer(ORG_A));
    const cancelled = await request(app).post(`/invoices/${invoice.id}/cancel`).set(bearer(ORG_A));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.invoice.invoiceNumber).toBe(issued.body.invoice.invoiceNumber);
  });

  it('refuses to cancel twice, and to issue a cancelled invoice', async () => {
    const customerId = await createCustomer(ORG_A);
    const invoice = await createInvoice(ORG_A, customerId);
    await request(app).post(`/invoices/${invoice.id}/cancel`).set(bearer(ORG_A));

    const again = await request(app).post(`/invoices/${invoice.id}/cancel`).set(bearer(ORG_A));
    expect(again.status).toBe(409);
    const issue = await request(app).post(`/invoices/${invoice.id}/issue`).set(bearer(ORG_A));
    expect(issue.status).toBe(409);
  });
});

describe('invoices: list', () => {
  it('filters by status', async () => {
    const customerId = await createCustomer(ORG_A);
    const a = await createInvoice(ORG_A, customerId);
    await createInvoice(ORG_A, customerId);
    await request(app).post(`/invoices/${a.id}/issue`).set(bearer(ORG_A));

    const issued = await request(app).get('/invoices?status=issued').set(bearer(ORG_A));
    expect(issued.body.total).toBe(1);
    const all = await request(app).get('/invoices').set(bearer(ORG_A));
    expect(all.body.total).toBe(2);
    expect(all.body.items[0].items).toBeUndefined();
  });
});
