import { todayInIndia } from '../invoices/numbering';
import { logger } from '../observability/logger';
import type { OverdueInvoice, ReminderRepository } from './repository';

/** Later an email/SMS notifier can implement this. For now we only write a log line. */
export interface ReminderNotifier {
  send(item: OverdueInvoice): Promise<void>;
}

export const logNotifier: ReminderNotifier = {
  async send(item) {
    logger.info(item, 'overdue invoice reminder');
  },
};

export interface ReminderRunResult {
  today: string;
  found: number;
  sent: number;
  failed: number;
}

/**
 * One failing notification must not stop the others, and must not make the whole job retry
 * (a retry would notify the already-notified invoices again). Only a repository error throws.
 */
export async function runOverdueReminders(
  repo: ReminderRepository,
  notifier: ReminderNotifier,
  today: string = todayInIndia(),
): Promise<ReminderRunResult> {
  const overdue = await repo.findOverdue(today);
  let sent = 0;
  let failed = 0;
  for (const item of overdue) {
    try {
      await notifier.send(item);
      sent++;
    } catch (err) {
      failed++;
      logger.error({ err, orgId: item.orgId, invoiceId: item.invoiceId }, 'reminder failed');
    }
  }
  return { today, found: overdue.length, sent, failed };
}
