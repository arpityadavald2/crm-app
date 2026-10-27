import { z } from 'zod';

export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Valid GST slabs in basis points: 0%, 5%, 12%, 18%, 28%.
export const GST_RATES_BP = [0, 500, 1200, 1800, 2800] as const;

const gstRateBp = z
  .number()
  .refine((value) => (GST_RATES_BP as readonly number[]).includes(value), {
    message: 'GST rate must be 0, 5, 12, 18 or 28 percent (in basis points, e.g. 1800)',
  });

// Limits keep every multiplication far below Number.MAX_SAFE_INTEGER.
const itemSchema = z.object({
  description: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(1).max(1000),
  unitPricePaise: z.number().int().min(0).max(1_000_000_000),
  gstRateBp,
});

// zod drops unknown fields, so totals, orgId, status etc. sent by a client are ignored.
export const createInvoiceSchema = z.object({
  customerId: z.number().int().positive(),
  dueDate: z.iso.date().nullish(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === '' ? null : value))
    .nullish(),
  items: z.array(itemSchema).min(1).max(100),
});

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(INVOICE_STATUSES).optional(),
  customerId: z.coerce.number().int().positive().optional(),
});
