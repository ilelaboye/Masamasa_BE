import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateReferralsMigration1782000000000 implements MigrationInterface {
  name = "CreateReferralsMigration1782000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "referral_code" character varying(10)`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "referred_by_id" integer`);

    // Backfill. The alphabet matches generateReferralCode() in
    // core/helpers/generateAlphaNumericString.ts — keep the two in step.
    // Codes are drawn per row and re-drawn on collision; the loop exits once
    // every row holds a code, which it always does since the keyspace
    // (31^7 ≈ 27.5e9) dwarfs any plausible user count.
    await queryRunner.query(`
      DO $$
      DECLARE
        alphabet CONSTANT text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
        target_id integer;
        candidate text;
        taken boolean;
      BEGIN
        FOR target_id IN SELECT id FROM "users" WHERE "referral_code" IS NULL LOOP
          LOOP
            candidate := '';
            FOR i IN 1..7 LOOP
              candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
            END LOOP;
            SELECT EXISTS(SELECT 1 FROM "users" WHERE "referral_code" = candidate) INTO taken;
            EXIT WHEN NOT taken;
          END LOOP;
          UPDATE "users" SET "referral_code" = candidate WHERE id = target_id;
        END LOOP;
      END $$;
    `);

    // Only now that no row is null can the column be tightened. Every account
    // must have a code — a null one would mean a user with nothing to share.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "referral_code" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_referral_code" UNIQUE ("referral_code")`,
    );

    // ON DELETE SET NULL: deleting a referrer must not cascade away the people
    // they introduced — those accounts simply lose the attribution.
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_referred_by_id" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_referred_by_id" ON "users" ("referred_by_id")`,
    );

    // withdrawal_status is a boolean: true = already moved to the main
    // balance, false = still sitting in the earning account.
    await queryRunner.query(
      `CREATE TABLE "referral_earnings" (
        "id" SERIAL NOT NULL,
        "user_id" integer NOT NULL,
        "referee_id" integer NOT NULL,
        "amount" double precision NOT NULL DEFAULT '0',
        "withdrawal_status" boolean NOT NULL DEFAULT false,
        "withdrawn_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_referral_earnings" PRIMARY KEY ("id")
      )`,
    );

    // The one-time guarantee.
    await queryRunner.query(
      `ALTER TABLE "referral_earnings" ADD CONSTRAINT "UQ_referral_earnings_user_referee" UNIQUE ("user_id", "referee_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_earnings" ADD CONSTRAINT "FK_referral_earnings_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_earnings" ADD CONSTRAINT "FK_referral_earnings_referee_id" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Drives the earnings summary, which reads every pending row for a user.
    await queryRunner.query(
      `CREATE INDEX "IDX_referral_earnings_user_status" ON "referral_earnings" ("user_id", "withdrawal_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_referral_earnings_user_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_earnings" DROP CONSTRAINT "FK_referral_earnings_referee_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_earnings" DROP CONSTRAINT "FK_referral_earnings_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_earnings" DROP CONSTRAINT "UQ_referral_earnings_user_referee"`,
    );
    await queryRunner.query(`DROP TABLE "referral_earnings"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_users_referred_by_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_referred_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_users_referral_code"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referred_by_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referral_code"`);
  }
}
