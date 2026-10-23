import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const ROLES = ['owner', 'accountant', 'sales'] as const;
export type Role = (typeof ROLES)[number];

export interface AccessTokenClaims {
  userId: number;
  orgId: number;
  role: Role;
}

const ISSUER = 'crm-app';
const AUDIENCE = 'crm-api';

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function signAccessToken(
  claims: AccessTokenClaims,
  secret: string = env.JWT_SECRET,
  ttlSeconds: number = env.JWT_ACCESS_TTL_SECONDS,
): string {
  return jwt.sign({ org: claims.orgId, role: claims.role }, secret, {
    algorithm: 'HS256',
    subject: String(claims.userId),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: ttlSeconds,
  });
}

/** Throws if the token is invalid, expired, or has unexpected content. */
export function verifyAccessToken(
  token: string,
  secret: string = env.JWT_SECRET,
): AccessTokenClaims {
  // Pinning the algorithm blocks the classic "alg: none" forgery attack.
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (typeof payload === 'string') throw new Error('Invalid token payload');

  const userId = Number(payload.sub);
  const orgId = Number(payload['org']);
  const role: unknown = payload['role'];
  if (!Number.isInteger(userId) || !Number.isInteger(orgId) || !isRole(role)) {
    throw new Error('Invalid token claims');
  }
  return { userId, orgId, role };
}
