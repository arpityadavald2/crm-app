import { Router, type Request } from 'express';
import { authenticate, requireRole } from '../auth/middleware';
import { parseBody } from '../auth/schemas';
import { AppError } from '../middleware/errors';
import { idSchema } from '../customers/schemas';
import type { LeadPatch, LeadRepository } from './repository';
import { createLeadSchema, leadListQuerySchema, updateLeadSchema } from './schemas';

// The ONLY place the organization comes from: the verified token. Never the body, query or URL.
function orgIdOf(req: Request): number {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.orgId;
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Lead not found');
}

export function createLeadsRouter(repo: LeadRepository): Router {
  const router = Router();
  router.use(authenticate);

  router.post('/', async (req, res) => {
    const body = parseBody(createLeadSchema, req.body);
    const lead = await repo.create(orgIdOf(req), {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      source: body.source ?? null,
      status: body.status,
      notes: body.notes ?? null,
    });
    res.status(201).json({ lead });
  });

  router.get('/', async (req, res) => {
    const query = parseBody(leadListQuerySchema, req.query);
    const { items, total } = await repo.list(orgIdOf(req), {
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      search: query.search,
      status: query.status,
    });
    res.json({ items, page: query.page, limit: query.limit, total });
  });

  router.get('/:id', async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const lead = await repo.findById(orgIdOf(req), id);
    if (!lead) throw notFound();
    res.json({ lead });
  });

  router.patch('/:id', async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const body = parseBody(updateLeadSchema, req.body);

    const patch: LeadPatch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.email !== undefined) patch.email = body.email;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.source !== undefined) patch.source = body.source;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.status !== undefined) patch.status = body.status;

    const lead = await repo.update(orgIdOf(req), id, patch);
    if (!lead) throw notFound();
    res.json({ lead });
  });

  // Turn a lead into a customer. The lead becomes "won" and remembers the customer id.
  router.post('/:id/convert', async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const result = await repo.convert(orgIdOf(req), id);
    if (result.kind === 'not_found') throw notFound();
    if (result.kind === 'already_converted') {
      throw new AppError(409, 'ALREADY_CONVERTED', 'Lead is already converted to a customer');
    }
    res.status(201).json({ lead: result.lead, customer: result.customer });
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
