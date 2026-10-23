import { z } from 'zod';

// Only used when running locally without a JWT_SECRET. Rejected in production below.
const DEV_JWT_SECRET = 'dev-only-insecure-secret-do-not-use-in-prod';

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

    JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.DB_PASSWORD.length > 0, {
    message: 'DB_PASSWORD is required in production',
    path: ['DB_PASSWORD'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.JWT_SECRET !== DEV_JWT_SECRET, {
    message: 'JWT_SECRET must be set to a real secret in production',
    path: ['JWT_SECRET'],
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
