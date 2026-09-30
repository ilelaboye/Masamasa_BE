import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordOtpToAdministratorsMigration1784200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "administrators" ADD COLUMN IF NOT EXISTS "token" character varying`,
    );

    await queryRunner.query(
      `ALTER TABLE "administrators" ADD COLUMN IF NOT EXISTS "token_sent_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "administrators" DROP COLUMN IF EXISTS "token_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" DROP COLUMN IF EXISTS "token"`,
    );
  }
}
