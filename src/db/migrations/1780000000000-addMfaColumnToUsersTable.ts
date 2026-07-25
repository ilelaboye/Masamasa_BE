import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddMfaColumnToUsersTable1780000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if the column already exists
        const table = await queryRunner.getTable("users");
        const mfaColumn = table?.findColumnByName("mfa");

        if (!mfaColumn) {
            await queryRunner.addColumn(
                "users",
                new TableColumn({
                    name: "mfa",
                    type: "boolean",
                    default: false,
                    isNullable: false,
                })
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("users", "mfa");
    }
}
