import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUsernameToUsersMigration1783700000000 implements MigrationInterface {
  name = "AddUsernameToUsersMigration1783700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "username" character varying(30)`,
    );

    // Backfill existing accounts as "<firstname>_<2 or 3 digits>", e.g.
    // "ada_42" or "ada_731", re-drawn on collision. New accounts choose
    // their own at signup.
    await queryRunner.query(`
      DO $$
      DECLARE
        row record;
        base text;
        candidate text;
        taken boolean;
        attempts int;
      BEGIN
        FOR row IN SELECT id, first_name FROM "users" WHERE "username" IS NULL LOOP
          base := left(regexp_replace(lower(coalesce(row.first_name, '')), '[^a-z0-9]', '', 'g'), 20);
          IF base = '' THEN base := 'user'; END IF;
          attempts := 0;
          LOOP
            -- 10..999 on the first draw. A first name has only 990 such
            -- slugs, so the range widens on each collision rather than
            -- looping forever once a popular name runs out.
            candidate := base || '_' || (10 + floor(random() * (990 + attempts * 1000)))::int;
            SELECT EXISTS(SELECT 1 FROM "users" WHERE "username" = candidate) INTO taken;
            EXIT WHEN NOT taken;
            attempts := attempts + 1;
          END LOOP;
          UPDATE "users" SET "username" = candidate WHERE id = row.id;
        END LOOP;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_users_username"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
  }
}
