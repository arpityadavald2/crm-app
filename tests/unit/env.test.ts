import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';

describe('loadEnv', () => {
  it('applies defaults when nothing is set', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DB_PORT).toBe(3306);
  });

  it('converts PORT from string to number', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws a readable error when PORT is not a number', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('throws when LOG_LEVEL is not allowed', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('requires DB_PASSWORD in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DB_PASSWORD/);
  });

  it('accepts production when DB_PASSWORD is set', () => {
    const env = loadEnv({ NODE_ENV: 'production', DB_PASSWORD: 'x' });
    expect(env.NODE_ENV).toBe('production');
  });
});
