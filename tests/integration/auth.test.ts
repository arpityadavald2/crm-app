import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { authenticate, requireRole } from '../../src/auth/middleware';
import {
  DuplicateEmailError,
  type AuthRepository,
  type NewOwnerInput,
  type UserRecord,
} from '../../src/auth/repository';
import { signAccessToken, type Role } from '../../src/auth/tokens';
import { errorHandler } from '../../src/middleware/errors';

/** A fake "database" so these tests need no MySQL. */
class InMemoryAuthRepository implements AuthRepository {
  private users: UserRecord[] = [];
  private nextId = 1;

  async createOrganizationWithOwner(input: NewOwnerInput) {
    if (this.users.some((u) => u.email === input.email)) throw new DuplicateEmailError();
    const id = this.nextId++;
    this.users.push({
      id,
      orgId: id,
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      role: 'owner',
      isActive: true,
    });
    return { orgId: id, userId: id };
  }

  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async findUserById(id: number) {
    return this.users.find((u) => u.id === id) ?? null;
  }
}

const payload = {
  organizationName: 'Acme Traders',
  fullName: 'Arpit Owner',
  email: 'Owner@Acme.test',
  password: 'correct-horse-battery',
};

let app: express.Express;

beforeEach(() => {
  // A fresh app per test also gives a fresh rate-limit counter.
  app = createApp({ authRepository: new InMemoryAuthRepository() });
});

describe('POST /auth/register', () => {
  it('creates the owner and returns a token without any password data', async () => {
    const res = await request(app).post('/auth/register').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('owner');
    expect(res.body.user.email).toBe('owner@acme.test');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/auth/register').send(payload);
    const res = await request(app).post('/auth/register').send(payload);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a short password with 400 and says which field', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...payload, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('password');
  });
});

describe('POST /auth/login', () => {
  it('logs in with the right password, whatever the email capitalisation', async () => {
    await request(app).post('/auth/register').send(payload);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'OWNER@acme.test', password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects a wrong password with 401', async () => {
    await request(app).post('/auth/register').send(payload);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: payload.email, password: 'wrong-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('gives the same answer for an unknown email (no hint who is registered)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@acme.test', password: 'whatever-123456' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });
});

describe('GET /auth/me', () => {
  it('returns the logged-in user', async () => {
    const reg = await request(app).post('/auth/register').send(payload);
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('owner@acme.test');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a garbage token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  const roleApp = express();
  roleApp.get('/owner-only', authenticate, requireRole('owner'), (_req, res) => {
    res.json({ ok: true });
  });
  roleApp.use(errorHandler);

  const tokenFor = (role: Role): string => signAccessToken({ userId: 1, orgId: 1, role });

  it('returns 403 when the role is not allowed', async () => {
    const res = await request(roleApp)
      .get('/owner-only')
      .set('Authorization', `Bearer ${tokenFor('accountant')}`);
    expect(res.status).toBe(403);
  });

  it('lets the allowed role through', async () => {
    const res = await request(roleApp)
      .get('/owner-only')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
  });
});
