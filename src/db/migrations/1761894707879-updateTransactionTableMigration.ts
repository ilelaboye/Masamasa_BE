import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTransactionTableMigration1761894707879 implements MigrationInterface {
    name = 'UpdateTransactionTableMigration1761894707879'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "coin_exchange_rate" double precision DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "coin_exchange_rate"`);
    }

}
