import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { registerReadinessCheck } from '../../src/health/readiness';

const app = createApp();

describe('health endpoints', () => {
  it('GET /health returns 200 and service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /ready returns 200 when all checks pass', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /ready returns 503 when a dependency check fails', async () => {
    registerReadinessCheck('fake-db', async () => {
      throw new Error('down');
    });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks['fake-db']).toBe('fail');
  });
});

describe('error handling', () => {
  it('unknown route returns JSON 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns 400, not 500', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
  });
});
