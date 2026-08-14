import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddStaffInviteToAdministratorsTable1781200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // "pending" covers staff who have been invited but have not set a
    // password yet. Postgres has no IF NOT EXISTS for enum values before 12,
    // so the duplicate is swallowed instead.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "administrators_status_enum" ADD VALUE 'pending';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // An invited admin has no password until they accept, so the column can
    // no longer be NOT NULL.
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "password" DROP NOT NULL`,
    );

    const table = await queryRunner.getTable("administrators");

    if (!table?.findColumnByName("invite_token")) {
      await queryRunner.addColumn(
        "administrators",
        new TableColumn({
          name: "invite_token",
          type: "character varying",
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName("invite_sent_at")) {
      await queryRunner.addColumn(
        "administrators",
        new TableColumn({
          name: "invite_sent_at",
          type: "timestamp",
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("administrators");

    if (table?.findColumnByName("invite_sent_at")) {
      await queryRunner.dropColumn("administrators", "invite_sent_at");
    }
    if (table?.findColumnByName("invite_token")) {
      await queryRunner.dropColumn("administrators", "invite_token");
    }

    // Any staff still mid-invite have no password and cannot satisfy a
    // NOT NULL constraint, so they are removed before it is restored.
    await queryRunner.query(
      `DELETE FROM "administrators" WHERE "password" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" ALTER COLUMN "password" SET NOT NULL`,
    );

    // Postgres cannot drop a single enum value, so the type is rebuilt
    // without 'pending'. Anyone still pending was deleted above.
    await queryRunner.query(`
      ALTER TABLE "administrators" ALTER COLUMN "status" DROP DEFAULT;
      ALTER TYPE "administrators_status_enum" RENAME TO "administrators_status_enum_old";
      CREATE TYPE "administrators_status_enum" AS ENUM ('active', 'suspend');
      ALTER TABLE "administrators"
        ALTER COLUMN "status" TYPE "administrators_status_enum"
        USING "status"::text::"administrators_status_enum";
      ALTER TABLE "administrators" ALTER COLUMN "status" SET DEFAULT 'active';
      DROP TYPE "administrators_status_enum_old";
    `);
  }
}
