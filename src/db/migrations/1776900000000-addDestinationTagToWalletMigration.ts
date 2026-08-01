import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDestinationTagToWalletMigration1776900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" ADD COLUMN IF NOT EXISTS "destination_tag" character varying`,
    );

    // Normalize rows written in the legacy "address:destination_tag" format
    // (XRP): split the tag into the new column.
    await queryRunner.query(
      `UPDATE "wallet"
       SET "destination_tag" = split_part("wallet_address", ':', 2),
           "wallet_address" = split_part("wallet_address", ':', 1)
       WHERE "wallet_address" LIKE '%:%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-embed the tag so no data is lost on rollback
    await queryRunner.query(
      `UPDATE "wallet"
       SET "wallet_address" = "wallet_address" || ':' || "destination_tag"
       WHERE "destination_tag" IS NOT NULL AND "destination_tag" <> ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet" DROP COLUMN IF EXISTS "destination_tag"`,
    );
  }
}
