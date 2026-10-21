import express from 'express';
import helmet from 'helmet';
import { healthRouter } from './health/routes';
import { errorHandler, notFoundHandler } from './middleware/errors';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // We will run behind Nginx/Cloudflare, so trust one proxy hop for the client IP.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
