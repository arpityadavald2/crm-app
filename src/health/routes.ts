import { Router } from 'express';
import { env } from '../config/env';
import { runReadiness } from './readiness';

export const healthRouter = Router();

// Liveness: is the process alive? Must NOT depend on the database or other systems,
// otherwise a database outage would make healthy app processes look dead.
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: env.SERVICE_NAME,
    version: env.APP_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Readiness: can we serve traffic right now? Checks dependencies.
healthRouter.get('/ready', async (_req, res) => {
  const result = await runReadiness();
  res.status(result.ready ? 200 : 503).json({
    status: result.ready ? 'ready' : 'not_ready',
    checks: result.checks,
  });
});
