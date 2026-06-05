import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWithdrawalWalletsMigration1775520000000 implements MigrationInterface {
  name = "CreateWithdrawalWalletsMigration1775520000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "withdrawal_wallets" ("id" SERIAL NOT NULL, "coin" character varying NOT NULL, "network" character varying NOT NULL, "address" character varying NOT NULL, "admin_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_withdrawal_wallets_coin_network" UNIQUE ("coin", "network"), CONSTRAINT "PK_withdrawal_wallets" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "withdrawal_wallets" ADD CONSTRAINT "FK_withdrawal_wallets_admin_id" FOREIGN KEY ("admin_id") REFERENCES "administrators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "withdrawal_wallets" DROP CONSTRAINT "FK_withdrawal_wallets_admin_id"`,
    );
    await queryRunner.query(`DROP TABLE "withdrawal_wallets"`);
  }
}
