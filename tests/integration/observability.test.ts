import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

const app = createApp();

describe('request id', () => {
  it('creates an x-request-id header when none is sent', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('reuses a valid incoming x-request-id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'my-trace-id-12345');
    expect(res.headers['x-request-id']).toBe('my-trace-id-12345');
  });

  it('includes requestId in error responses', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.requestId).toBeTruthy();
  });
});

describe('GET /metrics', () => {
  it('exposes prometheus metrics including request counters', async () => {
    await request(app).get('/health');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toContain('route="/health"');
  });
});
