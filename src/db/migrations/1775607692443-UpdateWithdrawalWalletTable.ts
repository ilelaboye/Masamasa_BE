import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateWithdrawalWalletTable1775607692443 implements MigrationInterface {
  name = "UpdateWithdrawalWalletTable1775607692443";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "withdrawals" ADD "transaction_hash" character varying NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "withdrawals" ADD "metadata" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "withdrawals" DROP COLUMN "metadata"`);
    await queryRunner.query(
      `ALTER TABLE "withdrawals" DROP COLUMN "transaction_hash"`,
    );
  }
}
