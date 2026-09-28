import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUsernameChangeableToUsersMigration1784000000000 implements MigrationInterface {
  name = "AddUsernameChangeableToUsersMigration1784000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users who chose their username at signup can never change it.
    await queryRunner.query(
      `ALTER TABLE "users" ADD "username_changeable" boolean NOT NULL DEFAULT false`,
    );

    // Accounts whose username the backfill in 1783700000000 generated get one
    // change. Rebuilds that migration's "<firstname>_<digits>" slug per row;
    // a signup who happened to pick exactly that shape also gets one change.
    await queryRunner.query(`
      UPDATE "users" SET "username_changeable" = true
      WHERE "username" ~ (
        '^' || coalesce(nullif(left(regexp_replace(lower(coalesce(first_name, '')), '[^a-z0-9]', '', 'g'), 20), ''), 'user')
        || '_[0-9]+$'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "username_changeable"`,
    );
  }
}
