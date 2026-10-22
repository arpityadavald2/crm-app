import { createApp } from './app';
import { env } from './config/env';
import { pingDb, pool } from './db/pool';
import { markShuttingDown, registerReadinessCheck } from './health/readiness';
import { logger } from './observability/logger';

registerReadinessCheck('mysql', () => pingDb(pool));

const app = createApp();
const server = app.listen(env.PORT, (error?: Error) => {
  if (error) throw error;
  logger.info({ port: env.PORT }, 'server listening');
});

// Must be larger than the reverse proxy's keep-alive timeout, otherwise
// Nginx may reuse a connection Node already closed (random 502 errors).
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown started');

  // 1) make /ready fail so the proxy stops sending new traffic
  markShuttingDown();

  // 2) stop accepting new connections, let in-flight requests finish
  server.close(async (error) => {
    // 3) only now close the database pool
    try {
      await pool.end();
    } catch (err) {
      logger.error({ err }, 'error closing database pool');
    }
    if (error) {
      logger.error({ err: error }, 'error during server close');
      process.exit(1);
    }
    logger.info('shutdown complete');
    process.exit(0);
  });

  // 4) hard stop if something hangs
  setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
