import { Router, type Request } from 'express';
import { authenticate, requireRole } from '../auth/middleware';
import { parseBody } from '../auth/schemas';
import { idSchema } from '../customers/schemas';
import { todayInIndia } from '../invoices/numbering';
import { AppError } from '../middleware/errors';
import type { PaymentRepository } from './repository';
import { createPaymentSchema } from './schemas';

// The ONLY place the organization comes from: the verified token. Never the body, query or URL.
function orgIdOf(req: Request): number {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.orgId;
}

function invoiceNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Invoice not found');
}

/** Mounted at /invoices/:id/payments */
export function createPaymentsRouter(repo: PaymentRepository): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.post('/', requireRole('owner', 'accountant'), async (req, res) => {
    const invoiceId = parseBody(idSchema, req.params.id);
    const body = parseBody(createPaymentSchema, req.body);

    if (body.paidOn > todayInIndia()) {
      throw new AppError(422, 'PAYMENT_IN_FUTURE', 'Payment date cannot be in the future');
    }

    const result = await repo.addPayment(orgIdOf(req), invoiceId, {
      amountPaise: body.amountPaise,
      paidOn: body.paidOn,
      method: body.method,
      reference: body.reference ?? null,
    });

    switch (result.kind) {
      case 'not_found':
        throw invoiceNotFound();
      case 'not_payable':
        throw new AppError(
          409,
          'NOT_PAYABLE',
          'Payments can only be added to an issued or partially paid invoice',
        );
      case 'overpayment':
        throw new AppError(
          422,
          'OVERPAYMENT',
          `Payment is more than the balance due (${result.balancePaise} paise)`,
        );
      case 'before_issue_date':
        throw new AppError(
          422,
          'PAYMENT_BEFORE_ISSUE',
          `Payment date cannot be before the invoice issue date (${result.issueDate})`,
        );
      case 'recorded':
        res.status(201).json({ payment: result.payment, invoice: result.invoice });
    }
  });

  router.get('/', async (req, res) => {
    const invoiceId = parseBody(idSchema, req.params.id);
    const items = await repo.list(orgIdOf(req), invoiceId);
    if (!items) throw invoiceNotFound();
    res.json({ items });
  });

  return router;
}
