import type { RequestHandler } from 'express';
import { AppError } from '../middleware/errors';
import { verifyAccessToken, type AccessTokenClaims, type Role } from './tokens';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenClaims;
  }
}

/** Requires "Authorization: Bearer <token>". On success, req.auth holds the user's claims. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    next(new AppError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header'));
    return;
  }
  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
};

/** Use AFTER authenticate. 401 = "who are you?", 403 = "I know you, but you may not do this". */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do this'));
      return;
    }
    next();
  };
}
