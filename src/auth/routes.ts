import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../middleware/errors';
import { authenticate } from './middleware';
import { hashPassword, verifyPassword } from './password';
import { DuplicateEmailError, type AuthRepository, type UserRecord } from './repository';
import { loginSchema, parseBody, registerSchema } from './schemas';
import { signAccessToken } from './tokens';

type PublicUser = Pick<UserRecord, 'id' | 'orgId' | 'email' | 'fullName' | 'role'>;

function publicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

function tokenResponse(user: PublicUser) {
  return {
    accessToken: signAccessToken({ userId: user.id, orgId: user.orgId, role: user.role }),
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    user: publicUser(user),
  };
}

// A real hash to compare against when the email does not exist, so a login for an unknown
// email takes about as long as one for a known email (no timing clue about who is registered).
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('not-a-real-password');
  return dummyHash;
}

export function createAuthRouter(repo: AuthRepository): Router {
  const router = Router();

  // In-memory counter: fine for one process. With several servers we will move it to Redis.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, please try again later'));
    },
  });

  router.post('/register', limiter, async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const passwordHash = await hashPassword(body.password);
    try {
      const { orgId, userId } = await repo.createOrganizationWithOwner({
        organizationName: body.organizationName,
        fullName: body.fullName,
        email: body.email,
        passwordHash,
      });
      res.status(201).json(
        tokenResponse({
          id: userId,
          orgId,
          email: body.email,
          fullName: body.fullName,
          role: 'owner',
        }),
      );
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw error;
    }
  });

  router.post('/login', limiter, async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const user = await repo.findUserByEmail(body.email);
    const passwordOk = await verifyPassword(
      user?.passwordHash ?? (await getDummyHash()),
      body.password,
    );
    if (!user || !passwordOk || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    res.json(tokenResponse(user));
  });

  router.get('/me', authenticate, async (req, res) => {
    const claims = req.auth;
    if (!claims) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const user = await repo.findUserById(claims.userId);
    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHORIZED', 'Account not found or disabled');
    }
    res.json({ user: publicUser(user) });
  });

  return router;
}
