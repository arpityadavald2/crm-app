import { Router, type Request } from 'express';
import { authenticate, requireRole } from '../auth/middleware';
import { parseBody } from '../auth/schemas';
import { idSchema } from '../customers/schemas';
import { AppError } from '../middleware/errors';
import { calculateInvoice, calculateLine, determineSupplyType } from './gst';
import { todayInIndia } from './numbering';
import type { InvoiceRepository } from './repository';
import { createInvoiceSchema, invoiceListQuerySchema } from './schemas';

// The ONLY place the organization comes from: the verified token. Never the body, query or URL.
function orgIdOf(req: Request): number {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.orgId;
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Invoice not found');
}

export function createInvoicesRouter(repo: InvoiceRepository): Router {
  const router = Router();
  router.use(authenticate);

  // Create a DRAFT. Money is calculated here on the server; the client never sends totals.
  router.post('/', requireRole('owner', 'accountant'), async (req, res) => {
    const body = parseBody(createInvoiceSchema, req.body);
    const orgId = orgIdOf(req);

    const parties = await repo.findParties(orgId, body.customerId);
    if (!parties) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');

    const supplyType = determineSupplyType(parties.sellerStateCode, parties.buyerStateCode);
    const items = body.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      gstRateBp: item.gstRateBp,
      ...calculateLine(item, supplyType),
    }));
    const { totals } = calculateInvoice(body.items, supplyType);

    const invoice = await repo.createDraft(orgId, {
      customerId: body.customerId,
      dueDate: body.dueDate ?? null,
      notes: body.notes ?? null,
      supplyType,
      sellerStateCode: parties.sellerStateCode,
      sellerGstin: parties.sellerGstin,
      buyerStateCode: parties.buyerStateCode,
      items,
      totals,
    });
    res.status(201).json({ invoice });
  });

  router.get('/', async (req, res) => {
    const query = parseBody(invoiceListQuerySchema, req.query);
    const { items, total } = await repo.list(orgIdOf(req), {
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      status: query.status,
      customerId: query.customerId,
    });
    res.json({ items, page: query.page, limit: query.limit, total });
  });

  // Totals for the dashboard. Must stay ABOVE "/:id", or "summary" would be read as an id.
  router.get('/summary', async (req, res) => {
    const summary = await repo.summarize(orgIdOf(req), todayInIndia());
    res.json({ summary });
  });

  router.get('/:id', async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const invoice = await repo.findById(orgIdOf(req), id);
    if (!invoice) throw notFound();
    res.json({ invoice });
  });

  // Draft -> issued. This is where the invoice number is assigned. After this it cannot be edited.
  router.post('/:id/issue', requireRole('owner', 'accountant'), async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const result = await repo.issue(orgIdOf(req), id, todayInIndia());
    if (result.kind === 'not_found') throw notFound();
    if (result.kind === 'not_draft') {
      throw new AppError(409, 'NOT_DRAFT', 'Only a draft invoice can be issued');
    }
    res.json({ invoice: result.invoice });
  });

  router.post('/:id/cancel', requireRole('owner', 'accountant'), async (req, res) => {
    const id = parseBody(idSchema, req.params.id);
    const result = await repo.cancel(orgIdOf(req), id);
    if (result.kind === 'not_found') throw notFound();
    if (result.kind === 'not_cancellable') {
      throw new AppError(
        409,
        'NOT_CANCELLABLE',
        'Only a draft, or an issued invoice with no payments, can be cancelled',
      );
    }
    res.json({ invoice: result.invoice });
  });

  return router;
}
