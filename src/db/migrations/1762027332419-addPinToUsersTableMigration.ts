import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPinToUsersTableMigration1762027332419 implements MigrationInterface {
    name = 'AddPinToUsersTableMigration1762027332419'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "pin" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pin"`);
    }

}
