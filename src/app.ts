import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { mysqlAuthRepository, type AuthRepository } from './auth/repository';
import { createAuthRouter } from './auth/routes';
import { createCustomersRouter } from './customers/routes';
import { mysqlCustomerRepository, type CustomerRepository } from './customers/repository';
import { healthRouter } from './health/routes';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { logger } from './observability/logger';
import { metricsMiddleware, registry } from './observability/metrics';

// Probes hit these every few seconds; logging them would only create noise.
const QUIET_PATHS = new Set(['/health', '/ready', '/metrics']);

export interface AppOptions {
  /** Tests pass fakes here; production uses the MySQL ones. */
  authRepository?: AuthRepository;
  customerRepository?: CustomerRepository;
}

export function createApp(options: AppOptions = {}): express.Express {
  const authRepository = options.authRepository ?? mysqlAuthRepository;
  const customerRepository = options.customerRepository ?? mysqlCustomerRepository;
  const app = express();

  app.disable('x-powered-by');
  // We will run behind Nginx/Cloudflare, so trust one proxy hop for the client IP.
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      // Reuse a valid incoming x-request-id (from Nginx), otherwise create one.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url ?? '') },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use('/auth', createAuthRouter(authRepository));
  app.use('/customers', createCustomersRouter(customerRepository));

  // NOTE: in production, Nginx must allow /metrics only from monitoring/internal IPs.
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
