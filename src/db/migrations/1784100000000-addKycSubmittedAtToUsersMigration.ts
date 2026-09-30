import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKycSubmittedAtToUsersMigration1784100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // The admin review queues need "when did this submission land", which no
    // existing column answers. `updated_at` is an @UpdateDateColumn and the auth
    // guard writes `last_seen_at` on every authenticated request, so it tracks
    // last activity — sorting by it ranks the least recently active first, and a
    // date range built on it silently drops anyone who logged in after
    // submitting.
    //
    // One column per queue, mirroring the kyc_status / address_status split: a
    // tier 3 submission arrives on an account whose tier 2 review is already
    // finished, so a single shared column would overwrite the identity date with
    // the address one.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kyc_submitted_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_submitted_at" TIMESTAMP`,
    );

    // Backfill what is already waiting in the queues, so existing submissions
    // carry a date instead of falling back to the signup date. `updated_at` is
    // the closest record of when they arrived, and it is exact for anyone who
    // has not logged in since submitting.
    await queryRunner.query(
      `UPDATE "users" SET "kyc_submitted_at" = "updated_at"
        WHERE "kyc_status" = 'pending' AND "kyc_submitted_at" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "address_submitted_at" = "updated_at"
        WHERE "address_status" = 'pending' AND "address_submitted_at" IS NULL`,
    );

    // Both queues sort and range-filter on these columns.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_kyc_submitted_at" ON "users" ("kyc_submitted_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_address_submitted_at" ON "users" ("address_submitted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_address_submitted_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_kyc_submitted_at"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "address_submitted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "kyc_submitted_at"`,
    );
  }
}
