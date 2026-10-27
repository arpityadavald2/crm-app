import { Queue, Worker } from 'bullmq';
import { env } from './config/env';
import { pool } from './db/pool';
import { logger } from './observability/logger';
import { mysqlReminderRepository } from './reminders/repository';
import { logNotifier, runOverdueReminders } from './reminders/service';

// Separate entry point from src/server.ts, so it can run as its own container later.
const QUEUE_NAME = 'reminders';
const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

const queue = new Queue(QUEUE_NAME, { connection });
const worker = new Worker(
  QUEUE_NAME,
  async () => runOverdueReminders(mysqlReminderRepository, logNotifier),
  { connection, concurrency: 1 },
);

queue.on('error', (err) => logger.error({ err }, 'queue error'));
worker.on('error', (err) => logger.error({ err }, 'worker error'));
worker.on('completed', (job, result) => logger.info({ jobId: job.id, result }, 'job completed'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));

async function start(): Promise<void> {
  // Creates the repeating schedule (or updates it if it already exists). Safe to run on every start.
  await queue.upsertJobScheduler(
    'overdue-reminders-daily',
    { pattern: env.REMINDER_CRON, tz: 'Asia/Kolkata' },
    {
      name: 'overdue-reminders',
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    },
  );
  logger.info({ cron: env.REMINDER_CRON }, 'worker started');
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'worker shutdown started');
  await worker.close(); // waits for the running job to finish
  await queue.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
