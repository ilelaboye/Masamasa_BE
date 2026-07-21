import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveWalletAddressUniqueConstraint1776200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" DROP CONSTRAINT IF EXISTS "UQ_wallet_wallet_address"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_wallet_wallet_address"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" ADD CONSTRAINT "UQ_wallet_wallet_address" UNIQUE ("wallet_address")`,
    );
  }
}
