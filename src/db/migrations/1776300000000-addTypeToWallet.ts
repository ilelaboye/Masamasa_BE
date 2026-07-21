import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTypeToWallet1776300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" ADD COLUMN IF NOT EXISTS "type" VARCHAR NOT NULL DEFAULT 'self_custodian'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wallet" DROP COLUMN IF EXISTS "type"`);
  }
}
