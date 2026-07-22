import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveWalletAddressUniqueConstraint1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" DROP CONSTRAINT IF EXISTS "UQ_476a9a59985bc92d1d91db035d9"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_476a9a59985bc92d1d91db035d9"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" ADD CONSTRAINT "UQ_476a9a59985bc92d1d91db035d9" UNIQUE ("wallet_address")`,
    );
  }
}
