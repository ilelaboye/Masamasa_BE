import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAddressVerificationToUsersMigration1783900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tier 3 gets its own status columns rather than reusing kyc_status and
    // kyc_image: a tier 3 submission arrives on an account that is already
    // kyc_status = 'success', so sharing them would collide with the identity
    // review queue.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_status" character varying NOT NULL DEFAULT 'none'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_proof_type" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_proof_image" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_error" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postal_code" character varying`,
    );

    // The admin review queue reads pending submissions oldest first.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_address_status" ON "users" ("address_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_address_status"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "postal_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "address_error"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "address_proof_image"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "address_proof_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "address_status"`,
    );
  }
}
