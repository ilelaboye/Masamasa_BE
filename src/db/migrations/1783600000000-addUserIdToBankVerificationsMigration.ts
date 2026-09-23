import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserIdToBankVerificationsMigration1783600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Which account an ID verified. Nullable and not backfilled: rows written
    // before this column existed cannot be attributed to a user after the
    // fact — the ID number itself is only kept as an excerpt plus a bcrypt
    // hash, so there is nothing to join on. The bank-account-number lookups
    // that share this table stay null too; they are not tied to a user.
    await queryRunner.query(
      `ALTER TABLE "bank_verifications" ADD COLUMN IF NOT EXISTS "user_id" integer`,
    );

    // ON DELETE SET NULL rather than CASCADE: a deleted account must not take
    // the record of its ID with it, or the same ID could verify a second
    // account by deleting the first.
    await queryRunner.query(
      `ALTER TABLE "bank_verifications"
       ADD CONSTRAINT "FK_bank_verifications_user_id"
       FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bank_verifications_user_id"
       ON "bank_verifications" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bank_verifications_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_verifications"
       DROP CONSTRAINT IF EXISTS "FK_bank_verifications_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_verifications" DROP COLUMN IF EXISTS "user_id"`,
    );
  }
}
