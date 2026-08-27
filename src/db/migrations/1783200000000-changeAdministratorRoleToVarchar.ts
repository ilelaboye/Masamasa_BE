import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Converts administrators.role from a Postgres enum to varchar, so adding a
 * role is a code change rather than a migration — matching notifications.tag
 * and notifications.status, which are varchar for the same reason.
 *
 * The Joi schema on the invite route stays the real gate on what can be
 * assigned.
 */
export class ChangeAdministratorRoleToVarchar1783200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("administrators");
    const column = table?.findColumnByName("role");
    if (!column || column.type === "character varying") return;

    // The default has to go first — it is typed against the enum.
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "role" TYPE character varying USING "role"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "role" SET DEFAULT 'super_admin'`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "administrators_role_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("administrators");
    const column = table?.findColumnByName("role");
    if (!column || column.type !== "character varying") return;

    // Anything outside the original two labels would not fit the enum, so move
    // those admins to the least-privileged role first.
    await queryRunner.query(
      `UPDATE "administrators" SET "role" = 'marketer' WHERE "role" NOT IN ('super_admin', 'marketer')`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "administrators_role_enum" AS ENUM ('super_admin', 'marketer');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "role" TYPE "administrators_role_enum" USING "role"::text::"administrators_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "role" SET DEFAULT 'super_admin'`,
    );
  }
}
