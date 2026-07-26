import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateAccessTokensMigration1776600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "access_tokens",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "type",
            type: "varchar",
          },
          {
            name: "token",
            type: "varchar",
          },
          {
            name: "refresh_token",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "json",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "now()",
          },
        ],
      }),
      true
    );

    // Tokens are looked up by provider type (e.g. "nomba")
    await queryRunner.createIndex(
      "access_tokens",
      new TableIndex({
        name: "IDX_ACCESS_TOKEN_TYPE",
        columnNames: ["type"],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("access_tokens", "IDX_ACCESS_TOKEN_TYPE");
    await queryRunner.dropTable("access_tokens");
  }
}
