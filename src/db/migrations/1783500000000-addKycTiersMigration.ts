import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKycTiersMigration1783500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tier 2 verification captures both sides of the document and a selfie;
    // the existing kyc_image holds the front.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kyc_image_back" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kyc_selfie" character varying`,
    );

    // Every account is tier 1 from registration.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kyc_tier" smallint NOT NULL DEFAULT 1`,
    );

    // Backfill: accounts that already passed identity verification are tier 2,
    // so the ladder does not show a verified user as unverified.
    await queryRunner.query(
      `UPDATE "users" SET "kyc_tier" = 2 WHERE "kyc_status" = 'success'`,
    );

    // bank_verifications.type was a pg enum holding bvn/other/accountNumber.
    // Tier 2 adds an entry per ID type and more will follow, so it becomes a
    // varchar — the same way users.kyc_status and administrators.roles are
    // stored — rather than needing an ALTER TYPE for each new one.
    await queryRunner.query(
      `ALTER TABLE "bank_verifications" ALTER COLUMN "type" TYPE character varying USING "type"::text`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bank_verifications_type_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "kyc_tier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "kyc_selfie"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "kyc_image_back"`,
    );

    // Rows written since the up() ran may hold values the old enum never had,
    // so anything outside the original three is parked as 'other' before the
    // type is narrowed again.
    await queryRunner.query(
      `UPDATE "bank_verifications" SET "type" = 'other'
       WHERE "type" NOT IN ('bvn', 'other', 'accountNumber')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_verifications_type_enum" AS ENUM('bvn', 'other', 'accountNumber')`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_verifications" ALTER COLUMN "type" TYPE "bank_verifications_type_enum" USING "type"::"bank_verifications_type_enum"`,
    );
  }
}
