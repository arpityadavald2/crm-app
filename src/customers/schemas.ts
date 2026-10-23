import { z } from 'zod';

// Format check only (15 characters in the GST pattern). It does not prove the GSTIN really exists.
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullish();

// Note: zod drops fields it does not know. Even if a client sends "orgId" or "id", it is ignored.
export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()).nullish(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,20}$/, 'Invalid phone number')
    .nullish(),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_FORMAT, 'Invalid GSTIN format').nullish(),
  billingAddress: optionalText(500),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const idSchema = z.coerce.number().int().positive();
