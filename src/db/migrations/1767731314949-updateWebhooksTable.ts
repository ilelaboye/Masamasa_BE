import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateWebhooksTable1767731314949 implements MigrationInterface {
  name = "UpdateWebhooksTable1767731314949";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhooks" ADD "hash" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "webhooks" ADD CONSTRAINT "UQ_b69fd0a5fbeda36098198424bff" UNIQUE ("hash")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhooks" DROP CONSTRAINT "UQ_b69fd0a5fbeda36098198424bff"`
    );
    await queryRunner.query(`ALTER TABLE "webhooks" DROP COLUMN "hash"`);
  }
}
