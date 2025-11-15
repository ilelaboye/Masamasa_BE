import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateUserTableMigration1763225346685 implements MigrationInterface {
    name = 'UpdateUserTableMigration1763225346685'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "kyc_status" character varying NOT NULL DEFAULT 'none'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "kyc_image" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "kyc_error" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "profile_image" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "kyc_type" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "kyc_type"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profile_image"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "kyc_error"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "kyc_image"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "kyc_status"`);
    }

}
