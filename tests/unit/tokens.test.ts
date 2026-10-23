import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../../src/auth/tokens';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
const claims = { userId: 7, orgId: 3, role: 'accountant' } as const;

describe('access tokens', () => {
  it('round-trips the claims', () => {
    const token = signAccessToken(claims, SECRET, 60);
    expect(verifyAccessToken(token, SECRET)).toEqual(claims);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken(claims, SECRET, 60);
    expect(() => verifyAccessToken(token, 'another-secret-that-is-also-32-chars-long')).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signAccessToken(claims, SECRET, -10);
    expect(() => verifyAccessToken(token, SECRET)).toThrow(/expired/i);
  });

  it('rejects a forged token that uses alg "none"', () => {
    const b64 = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: '1',
      org: 1,
      role: 'owner',
      iss: 'crm-app',
      aud: 'crm-api',
      exp: Math.floor(Date.now() / 1000) + 600,
    })}.`;
    expect(() => verifyAccessToken(forged, SECRET)).toThrow();
  });
});
