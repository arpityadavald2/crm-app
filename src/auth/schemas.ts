import { z } from 'zod';
import { AppError } from '../middleware/errors';

// Emails are trimmed and lowercased so "Owner@Acme.test" and "owner@acme.test" are the same account.
const email = z.string().trim().toLowerCase().max(255).pipe(z.email());

export const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(150),
  fullName: z.string().trim().min(2).max(150),
  email,
  // Max length stops someone from sending a 10 MB "password" to burn CPU while hashing.
  password: z.string().min(12).max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

/** Validates a request body or throws a 400 with a list of what is wrong. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Invalid request body',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
