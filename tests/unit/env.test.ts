import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';

describe('loadEnv', () => {
  it('applies defaults when nothing is set', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
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
});
