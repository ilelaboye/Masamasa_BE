import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSchedulingToNotificationsTable1783100000000 implements MigrationInterface {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("notifications");

    if (table?.findColumnByName("status")) {
      await queryRunner.query(
        `ALTER TABLE "notifications" DROP COLUMN "status"`,
      );
    }
    if (table?.findColumnByName("scheduled_for")) {
      await queryRunner.query(
        `ALTER TABLE "notifications" DROP COLUMN "scheduled_for"`,
      );
    }
  }
}
