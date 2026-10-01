import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAffiliatesMigration1784300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "affiliates" (
        "id" SERIAL PRIMARY KEY,
        -- Public identifier, safe to put in a URL or hand to a partner: it
        -- leaks neither the row count nor the order rows were created in, which
        -- a serial id does. gen_random_uuid() is built into Postgres 13+, so
        -- unlike uuid_generate_v4() it needs no extension.
        "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        -- Which admin enrolled them, the same record exchange_rates and
        -- withdrawal_wallets keep. Nullable so SET NULL below can fire.
        "admin_id" integer,
        -- varchar, not a pg enum, so a new status needs no ALTER TYPE.
        "status" character varying NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "UQ_affiliates_uuid" UNIQUE ("uuid"),
        CONSTRAINT "FK_affiliates_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        -- SET NULL rather than CASCADE: losing the administrator row must not
        -- take the affiliates they enrolled with it.
        CONSTRAINT "FK_affiliates_admin" FOREIGN KEY ("admin_id")
          REFERENCES "administrators" ("id") ON DELETE SET NULL
      )
    `);

    // One affiliate row per account, enforced here rather than by a read in the
    // service: two simultaneous requests would both pass an "already exists?"
    // check and insert. Partial, so a soft-deleted row does not block the user
    // from being enrolled again.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_affiliates_user"
         ON "affiliates" ("user_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_affiliates_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliates"`);
  }
}
