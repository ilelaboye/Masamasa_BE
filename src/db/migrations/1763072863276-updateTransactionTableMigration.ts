import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTransactionTableMigration1763072863276 implements MigrationInterface {
    name = 'UpdateTransactionTableMigration1763072863276'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "status" character varying NOT NULL DEFAULT 'success'`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "masamasa_ref" character varying`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "session_id" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "session_id"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "masamasa_ref"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "status"`);
    }

}
