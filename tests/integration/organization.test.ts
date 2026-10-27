import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { signAccessToken, type Role } from '../../src/auth/tokens';
import { InMemoryOrganizationRepository } from '../helpers/in-memory-organizations';

const ORG_A = 1;
const ORG_B = 2;
const GSTIN_PUNJAB = '03ABCDE1234F1Z5';
const GSTIN_KARNATAKA = '29ABCDE1234F1Z5';

const bearer = (orgId: number, role: Role = 'owner') => ({
  Authorization: `Bearer ${signAccessToken({ userId: orgId * 10, orgId, role })}`,
});

let app: express.Express;

beforeEach(() => {
  app = createApp({
    organizationRepository: new InMemoryOrganizationRepository([
      { id: ORG_A, name: 'Acme Traders', gstin: null, stateCode: null },
      { id: ORG_B, name: 'Zeta Stores', gstin: null, stateCode: null },
    ]),
  });
});

describe('GET /organization', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/organization');
    expect(res.status).toBe(401);
  });

  it('returns only the caller organization, for any role', async () => {
    const res = await request(app).get('/organization').set(bearer(ORG_A, 'sales'));
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ id: ORG_A, name: 'Acme Traders' });
  });

  it('returns 404 when the token org does not exist', async () => {
    const res = await request(app).get('/organization').set(bearer(999));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /organization', () => {
  it('owner sets the GSTIN and the state code is derived from it', async () => {
    const res = await request(app)
      .patch('/organization')
      .set(bearer(ORG_A))
      .send({ gstin: GSTIN_PUNJAB });
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ gstin: GSTIN_PUNJAB, stateCode: '03' });
  });

  it('lowercase GSTIN is normalised to uppercase', async () => {
    const res = await request(app)
      .patch('/organization')
      .set(bearer(ORG_A))
      .send({ gstin: GSTIN_KARNATAKA.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ gstin: GSTIN_KARNATAKA, stateCode: '29' });
  });

  it('gstin null clears both gstin and state code', async () => {
    await request(app).patch('/organization').set(bearer(ORG_A)).send({ gstin: GSTIN_PUNJAB });
    const res = await request(app).patch('/organization').set(bearer(ORG_A)).send({ gstin: null });
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ gstin: null, stateCode: null });
  });

  it('rejects an invalid GSTIN with 400', async () => {
    const res = await request(app)
      .patch('/organization')
      .set(bearer(ORG_A))
      .send({ gstin: 'NOT-A-GSTIN' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing gstin field with 400', async () => {
    const res = await request(app).patch('/organization').set(bearer(ORG_A)).send({});
    expect(res.status).toBe(400);
  });

  it('accountant and sales cannot change it (403)', async () => {
    for (const role of ['accountant', 'sales'] as const) {
      const res = await request(app)
        .patch('/organization')
        .set(bearer(ORG_A, role))
        .send({ gstin: GSTIN_PUNJAB });
      expect(res.status).toBe(403);
    }
  });

  it('ignores stateCode, id and orgId sent by the client', async () => {
    const res = await request(app)
      .patch('/organization')
      .set(bearer(ORG_A))
      .send({ gstin: GSTIN_PUNJAB, stateCode: '99', id: ORG_B, orgId: ORG_B });
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ id: ORG_A, stateCode: '03' });
  });

  it('one organization never changes or sees another', async () => {
    await request(app).patch('/organization').set(bearer(ORG_A)).send({ gstin: GSTIN_PUNJAB });
    const other = await request(app).get('/organization').set(bearer(ORG_B));
    expect(other.body.organization).toMatchObject({ id: ORG_B, gstin: null, stateCode: null });
  });
});
