import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPinResetAtToUsersMigration1783800000000 implements MigrationInterface {
  name = "AddPinResetAtToUsersMigration1783800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Null for every existing account — nobody is mid-freeze at deploy time.
    await queryRunner.query(`ALTER TABLE "users" ADD "pin_reset_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pin_reset_at"`);
  }
}
