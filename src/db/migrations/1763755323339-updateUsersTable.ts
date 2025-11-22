import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateUsersTable1763755323339 implements MigrationInterface {
    name = 'UpdateUsersTable1763755323339'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "device_id" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "notification_token" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "notification_token"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "device_id"`);
    }

}
