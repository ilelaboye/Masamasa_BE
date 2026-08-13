import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddRoleToAdministratorsTable1781100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("administrators");
    if (table?.findColumnByName("role")) return;

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "administrators_role_enum" AS ENUM (
          'super_admin', 'marketer'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.addColumn(
      "administrators",
      new TableColumn({
        name: "role",
        type: "administrators_role_enum",
        default: "'super_admin'",
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("administrators");
    if (table?.findColumnByName("role")) {
      await queryRunner.dropColumn("administrators", "role");
    }
    await queryRunner.query(`DROP TYPE IF EXISTS "administrators_role_enum"`);
  }
}
