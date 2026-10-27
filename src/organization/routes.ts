import { Router, type Request } from 'express';
import { authenticate, requireRole } from '../auth/middleware';
import { parseBody } from '../auth/schemas';
import { stateCodeFromGstin } from '../customers/routes';
import { AppError } from '../middleware/errors';
import type { OrganizationRepository } from './repository';
import { updateOrganizationSchema } from './schemas';

// The ONLY place the organization comes from: the verified token. Never the body, query or URL.
function orgIdOf(req: Request): number {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.orgId;
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Organization not found');
}

export function createOrganizationRouter(repo: OrganizationRepository): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (req, res) => {
    const organization = await repo.findById(orgIdOf(req));
    if (!organization) throw notFound();
    res.json({ organization });
  });

  router.patch('/', requireRole('owner'), async (req, res) => {
    const body = parseBody(updateOrganizationSchema, req.body);
    const organization = await repo.updateGst(
      orgIdOf(req),
      body.gstin,
      stateCodeFromGstin(body.gstin),
    );
    if (!organization) throw notFound();
    res.json({ organization });
  });

  return router;
}
