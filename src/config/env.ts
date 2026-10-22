import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SERVICE_NAME: z.string().min(1).default('crm-app'),
    APP_VERSION: z.string().min(1).default('0.0.0'),

    DB_HOST: z.string().min(1).default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_NAME: z.string().min(1).default('crm'),
    DB_USER: z.string().min(1).default('crm_app'),
    DB_PASSWORD: z.string().default(''),
    DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.DB_PASSWORD.length > 0, {
    message: 'DB_PASSWORD is required in production',
    path: ['DB_PASSWORD'],
  });

export type Env = z.infer<typeof schema>;

/** Validates environment variables once at startup. Throws a readable error if invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
