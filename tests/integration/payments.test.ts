import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { signAccessToken, type Role } from '../../src/auth/tokens';
import { InMemoryCustomerRepository } from '../helpers/in-memory-customers';

import { InMemoryInvoiceRepository } from '../helpers/in-memory-invoices';

import { InMemoryPaymentRepository } from '../helpers/in-memory-payments';
import { todayInIndia } from '../../src/invoices/numbering';

const ORG_A = 1;
const ORG_B = 2;

const bearer = (orgId: number, role: Role = 'owner') => ({
  Authorization: `Bearer ${signAccessToken({ userId: orgId * 10, orgId, role })}`,
});

let app: express.Express;

beforeEach(() => {
  const customers = new InMemoryCustomerRepository();
  const invoices = new InMemoryInvoiceRepository(customers, { [ORG_A]: '03', [ORG_B]: '03' });
  app = createApp({
    customerRepository: customers,
    invoiceRepository: invoices,
    paymentRepository: new InMemoryPaymentRepository(invoices),
  });
});

// Invoice total is 118000 paise (Rs 1,180): 2 x Rs 500 + 18% GST.
const item = { description: 'Consulting', quantity: 2, unitPricePaise: 50000, gstRateBp: 1800 };
const today = todayInIndia();

async function draftInvoice(orgId: number): Promise<number> {
  const customer = await request(app)
    .post('/customers')
    .set(bearer(orgId))
    .send({ name: 'Sharma Traders' });
  const invoice = await request(app)
    .post('/invoices')
    .set(bearer(orgId))
    .send({ customerId: customer.body.customer.id, items: [item] });
  return invoice.body.invoice.id as number;
}

async function issuedInvoice(orgId: number): Promise<number> {
  const id = await draftInvoice(orgId);
  await request(app).post(`/invoices/${id}/issue`).set(bearer(orgId));
  return id;
}

const pay = (
  orgId: number,
  invoiceId: number,
  body: Record<string, unknown>,
  role: Role = 'owner',
) =>
  request(app)
    .post(`/invoices/${invoiceId}/payments`)
    .set(bearer(orgId, role))
    .send({ paidOn: today, method: 'upi', ...body });

describe('payments: access and roles', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/invoices/1/payments');
    expect(res.status).toBe(401);
  });

  it('lets sales read but not add payments', async () => {
    const id = await issuedInvoice(ORG_A);
    expect((await pay(ORG_A, id, { amountPaise: 1000 }, 'sales')).status).toBe(403);
    const list = await request(app).get(`/invoices/${id}/payments`).set(bearer(ORG_A, 'sales'));
    expect(list.status).toBe(200);
  });
});

describe('payments: partial and full payment', () => {
  it('moves the invoice to partially_paid, then paid', async () => {
    const id = await issuedInvoice(ORG_A);

    const first = await pay(ORG_A, id, { amountPaise: 50000, reference: 'UPI-123' });
    expect(first.status).toBe(201);
    expect(first.body.payment.amountPaise).toBe(50000);
    expect(first.body.payment.reference).toBe('UPI-123');
    expect(first.body.invoice.status).toBe('partially_paid');
    expect(first.body.invoice.amountPaidPaise).toBe(50000);

    const second = await pay(ORG_A, id, { amountPaise: 68000, method: 'cash' });
    expect(second.status).toBe(201);
    expect(second.body.invoice.status).toBe('paid');
    expect(second.body.invoice.amountPaidPaise).toBe(118000);

    const list = await request(app).get(`/invoices/${id}/payments`).set(bearer(ORG_A));
    expect(list.body.items).toHaveLength(2);
  });

  it('refuses a payment bigger than the balance, and leaves the invoice unchanged', async () => {
    const id = await issuedInvoice(ORG_A);
    await pay(ORG_A, id, { amountPaise: 100000 });

    const over = await pay(ORG_A, id, { amountPaise: 18001 });
    expect(over.status).toBe(422);

    const invoice = await request(app).get(`/invoices/${id}`).set(bearer(ORG_A));
    expect(invoice.body.invoice.amountPaidPaise).toBe(100000);
    expect(invoice.body.invoice.status).toBe('partially_paid');
  });

  it('refuses any payment on a fully paid invoice', async () => {
    const id = await issuedInvoice(ORG_A);
    await pay(ORG_A, id, { amountPaise: 118000 });
    expect((await pay(ORG_A, id, { amountPaise: 1 })).status).toBe(409);
  });
});

describe('payments: invoice status rules', () => {
  it('refuses payments on a draft and on a cancelled invoice', async () => {
    const draft = await draftInvoice(ORG_A);
    expect((await pay(ORG_A, draft, { amountPaise: 1000 })).status).toBe(409);

    const cancelled = await issuedInvoice(ORG_A);
    await request(app).post(`/invoices/${cancelled}/cancel`).set(bearer(ORG_A));
    expect((await pay(ORG_A, cancelled, { amountPaise: 1000 })).status).toBe(409);
  });

  it('stops an invoice with a payment from being cancelled', async () => {
    const id = await issuedInvoice(ORG_A);
    await pay(ORG_A, id, { amountPaise: 1000 });
    const res = await request(app).post(`/invoices/${id}/cancel`).set(bearer(ORG_A));
    expect(res.status).toBe(409);
  });
});

describe('payments: dates and validation', () => {
  it('rejects a future date and a date before the invoice was issued', async () => {
    const id = await issuedInvoice(ORG_A);
    expect((await pay(ORG_A, id, { amountPaise: 1000, paidOn: '2999-01-01' })).status).toBe(422);
    expect((await pay(ORG_A, id, { amountPaise: 1000, paidOn: '2000-01-01' })).status).toBe(422);
  });

  it('rejects bad input', async () => {
    const id = await issuedInvoice(ORG_A);
    expect((await pay(ORG_A, id, { amountPaise: 0 })).status).toBe(400);
    expect((await pay(ORG_A, id, { amountPaise: 10.5 })).status).toBe(400);
    expect((await pay(ORG_A, id, { amountPaise: 1000, method: 'bitcoin' })).status).toBe(400);
    expect((await pay(ORG_A, id, { amountPaise: 1000, paidOn: 'yesterday' })).status).toBe(400);
  });
});

describe('payments: organization isolation', () => {
  it('does not let another organization see or add payments', async () => {
    const id = await issuedInvoice(ORG_A);
    await pay(ORG_A, id, { amountPaise: 1000 });

    expect((await pay(ORG_B, id, { amountPaise: 1000 })).status).toBe(404);
    const list = await request(app).get(`/invoices/${id}/payments`).set(bearer(ORG_B));
    expect(list.status).toBe(404);
  });
});
