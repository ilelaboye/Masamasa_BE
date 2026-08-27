import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSchedulingToNotificationsTable1783100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("notifications");

    if (!table?.findColumnByName("scheduled_for")) {
      await queryRunner.query(
        `ALTER TABLE "notifications" ADD "scheduled_for" TIMESTAMP WITH TIME ZONE`,
      );
    }

    // Defaults to 'sent' so existing rows and every current create path stay
    // delivered. Only the scheduling path writes 'pending'.
    if (!table?.findColumnByName("status")) {
      await queryRunner.query(
        `ALTER TABLE "notifications" ADD "status" character varying NOT NULL DEFAULT 'sent'`,
      );
    }

    // Carries over an environment that ran the earlier is_sent version.
    if (table?.findColumnByName("is_sent")) {
      await queryRunner.query(
        `UPDATE "notifications" SET "status" = CASE WHEN "is_sent" THEN 'sent' ELSE 'pending' END`,
      );
      await queryRunner.query(
        `ALTER TABLE "notifications" DROP COLUMN "is_sent"`,
      );
    }

    // Partial: the cron only ever looks for pending rows, and those are a tiny
    // slice of a table that grows one row per user per notification.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_pending_schedule"
      ON "notifications" ("scheduled_for")
      WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_notifications_pending_schedule"`,
    );

    const table = await queryRunner.getTable("notifications");

    if (table?.findColumnByName("status")) {
      await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "status"`);
    }
    if (table?.findColumnByName("scheduled_for")) {
      await queryRunner.query(
        `ALTER TABLE "notifications" DROP COLUMN "scheduled_for"`,
      );
    }
  }
}
