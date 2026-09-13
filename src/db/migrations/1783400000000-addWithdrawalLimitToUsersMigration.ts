import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWithdrawalLimitToUsersMigration1783400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Default matches WITHDRAWAL_MAX_UNVERIFIED — the ceiling every account
    // starts on until KYC is approved or an admin raises it.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "withdrawal_limit" numeric(20,2) NOT NULL DEFAULT 50000`,
    );

    // Backfill: accounts already verified keep the limit they had before this
    // column existed (WITHDRAWAL_MAX_PER_DAY), rather than being silently
    // dropped to the unverified default.
    await queryRunner.query(
      `UPDATE "users" SET "withdrawal_limit" = 5000000 WHERE "kyc_status" = 'success'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "withdrawal_limit"`,
    );
  }
}
