import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The hourly release cron claims due broadcasts with
 *   WHERE status = 'pending' AND scheduled_for >= .. AND scheduled_for < ..
 * and `notifications` has no index on either column, so every tick seq-scanned
 * the entire table — which grows by one row per user per broadcast — to find
 * the handful of template rows that are due.
 *
 * Partial on status = 'pending': a row is pending only between being scheduled
 * and being released, so the index stays a few pages regardless of how large
 * the table gets, and rows leave it as they are sent.
 */
export class AddNotificationsPendingScheduleIndex1783300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_pending_scheduled_for" ON "notifications" ("scheduled_for") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notifications_pending_scheduled_for"`,
    );
  }
}
