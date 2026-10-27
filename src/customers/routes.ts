import { Router, type Request } from 'express';
import { authenticate, requireRole } from '../auth/middleware';
import { parseBody } from '../auth/schemas';
import { AppError } from '../middleware/errors';
import type { CustomerPatch, CustomerRepository } from './repository';
import { createCustomerSchema, idSchema, listQuerySchema, updateCustomerSchema } from './schemas';

// The ONLY place the organization comes from: the verified token. Never the body, query or URL.
function orgIdOf(req: Request): number {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.orgId;
}

// The first two digits of a GSTIN are the state code.
function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  return gstin ? gstin.slice(0, 2) : null;
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Customer not found');
}

export function createCustomersRouter(repo: CustomerRepository): Router {
  const router = Router();
  router.use(authenticate);

  router.post('/', async (req, res) => {
    const body = parseBody(createCustomerSchema, req.body);
    const customer = await repo.create(orgIdOf(req), {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      gstin: body.gstin ?? null,
      billingAddress: body.billingAddress ?? null,
      stateCode: stateCodeFromGstin(body.gstin),
    });
    res.status(201).json({ customer });
  });

  router.get('/', async (req, res) => {
    const query = parseBody(listQuerySchema, req.query);
    const { items, total } = await repo.list(orgIdOf(req), {
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      search: query.search,
    });
    res.json({ items, page: query.page, limit: query.limit, total });
  });

  router.get('/:id', async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const customer = await repo.findById(orgIdOf(req), id);
    if (!customer) throw notFound();
    res.json({ customer });
  });

  router.patch('/:id', async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const body = parseBody(updateCustomerSchema, req.body);

    const patch: CustomerPatch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.email !== undefined) patch.email = body.email;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.billingAddress !== undefined) patch.billingAddress = body.billingAddress;
    if (body.gstin !== undefined) {
      patch.gstin = body.gstin;
      patch.stateCode = stateCodeFromGstin(body.gstin);
    }

    const customer = await repo.update(orgIdOf(req), id, patch);
    if (!customer) throw notFound();
    res.json({ customer });
  });

  // Only the owner may delete.
  router.delete('/:id', requireRole('owner'), async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const deleted = await repo.softDelete(orgIdOf(req), id);
    if (!deleted) throw notFound();
    res.status(204).end();
  });

  return router;
}
