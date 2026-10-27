import { z } from 'zod';

export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'cheque', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// zod drops unknown fields, so orgId, invoiceId or status sent by a client are ignored.
export const createPaymentSchema = z.object({
  amountPaise: z.number().int().min(1).max(100_000_000_000_000),
  paidOn: z.iso.date(),
  method: z.enum(PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .max(100)
    .transform((value) => (value === '' ? null : value))
    .nullish(),
});
