import { z } from 'zod';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullish();

// zod drops unknown fields, so a client cannot send "orgId", "id" or "customerId".
export const createLeadSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()).nullish(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,20}$/, 'Invalid phone number')
    .nullish(),
  source: optionalText(100),
  notes: optionalText(1000),
  status: z.enum(LEAD_STATUSES).default('new'),
});

export const updateLeadSchema = createLeadSchema
  .partial()
  .extend({ status: z.enum(LEAD_STATUSES).optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export const leadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
});
