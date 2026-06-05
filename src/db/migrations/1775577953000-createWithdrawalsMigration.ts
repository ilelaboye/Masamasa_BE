import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWithdrawalsMigration1775577953000 implements MigrationInterface {
  name = "CreateWithdrawalsMigration1775577953000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "withdrawals" ("id" SERIAL NOT NULL, "amount" double precision NOT NULL, "withdrawal_wallet_id" integer NOT NULL, "admin_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_withdrawals" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "withdrawals" ADD CONSTRAINT "FK_withdrawals_withdrawal_wallet_id" FOREIGN KEY ("withdrawal_wallet_id") REFERENCES "withdrawal_wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "withdrawals" ADD CONSTRAINT "FK_withdrawals_admin_id" FOREIGN KEY ("admin_id") REFERENCES "administrators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "withdrawals" DROP CONSTRAINT "FK_withdrawals_admin_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "withdrawals" DROP CONSTRAINT "FK_withdrawals_withdrawal_wallet_id"`,
    );
    await queryRunner.query(`DROP TABLE "withdrawals"`);
  }
}
