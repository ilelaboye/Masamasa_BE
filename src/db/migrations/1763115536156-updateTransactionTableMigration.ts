import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTransactionTableMigration1763115536156 implements MigrationInterface {
    name = 'UpdateTransactionTableMigration1763115536156'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "retry" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "retry"`);
    }

}
