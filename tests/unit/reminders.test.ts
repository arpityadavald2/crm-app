import { describe, expect, it } from 'vitest';
import type { OverdueInvoice, ReminderRepository } from '../../src/reminders/repository';
import { runOverdueReminders, type ReminderNotifier } from '../../src/reminders/service';

const overdue = (invoiceId: number, orgId = 1): OverdueInvoice => ({
  orgId,
  invoiceId,
  invoiceNumber: `INV/2026-27/${String(invoiceId).padStart(4, '0')}`,
  dueDate: '2026-10-01',
  balancePaise: 118000,
  daysOverdue: 27,
});

function fakeRepo(items: OverdueInvoice[]): ReminderRepository & { askedFor: string[] } {
  const askedFor: string[] = [];
  return {
    askedFor,
    async findOverdue(today) {
      askedFor.push(today);
      return items;
    },
  };
}

function recordingNotifier(failOn: number[] = []): ReminderNotifier & { sent: OverdueInvoice[] } {
  const sent: OverdueInvoice[] = [];
  return {
    sent,
    async send(item) {
      if (failOn.includes(item.invoiceId)) throw new Error('notifier down');
      sent.push(item);
    },
  };
}

describe('runOverdueReminders', () => {
  it('notifies every overdue invoice, across organizations', async () => {
    const repo = fakeRepo([overdue(1, 1), overdue(2, 1), overdue(3, 2)]);
    const notifier = recordingNotifier();
    const result = await runOverdueReminders(repo, notifier, '2026-10-28');
    expect(result).toEqual({ today: '2026-10-28', found: 3, sent: 3, failed: 0 });
    expect(notifier.sent.map((i) => [i.orgId, i.invoiceId])).toEqual([
      [1, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('passes the given date to the repository', async () => {
    const repo = fakeRepo([]);
    await runOverdueReminders(repo, recordingNotifier(), '2026-10-28');
    expect(repo.askedFor).toEqual(['2026-10-28']);
  });

  it('does nothing when nothing is overdue', async () => {
    const notifier = recordingNotifier();
    const result = await runOverdueReminders(fakeRepo([]), notifier, '2026-10-28');
    expect(result).toEqual({ today: '2026-10-28', found: 0, sent: 0, failed: 0 });
    expect(notifier.sent).toHaveLength(0);
  });

  it('one failing notification does not stop the others and does not throw', async () => {
    const repo = fakeRepo([overdue(1), overdue(2), overdue(3)]);
    const notifier = recordingNotifier([2]);
    const result = await runOverdueReminders(repo, notifier, '2026-10-28');
    expect(result).toMatchObject({ found: 3, sent: 2, failed: 1 });
    expect(notifier.sent.map((i) => i.invoiceId)).toEqual([1, 3]);
  });

  it('a repository error is thrown, so the queue can retry the job', async () => {
    const repo: ReminderRepository = {
      async findOverdue() {
        throw new Error('db down');
      },
    };
    await expect(runOverdueReminders(repo, recordingNotifier(), '2026-10-28')).rejects.toThrow(
      'db down',
    );
  });
});
