import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PlatformService } from '../platform/platform.service';
import { logEvent } from '../common/logger';

const TICK_MS = 60_000;

/**
 * Scheduled voter reminders: queues reminder_open / reminder_close
 * notification batches ~5 minutes around each election's voting window.
 * Dedupe lives in the notification_batches table, so restarts and multiple
 * instances won't double-send (the check-then-insert race is benign: a rare
 * duplicate batch is possible but bounded by the tick cadence).
 */
@Injectable()
export class ReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly platform: PlatformService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const orgs = await this.platform.store.listOrganizations();
      for (const org of orgs) {
        const elections = await this.platform.store.listElections(org.id);
        for (const election of elections) {
          await this.platform.reapStaleNotificationBatches(election.id).catch(() => undefined);
          await this.platform.maybeQueueReminder(election.id).catch((err) => {
            logEvent('warn', 'reminder.tick_failed', {
              electionId: election.id,
              error: err instanceof Error ? err.message : 'unknown',
            });
          });
        }
      }
    } catch (err) {
      logEvent('warn', 'reminder.tick_failed', { error: err instanceof Error ? err.message : 'unknown' });
    }
  }
}
