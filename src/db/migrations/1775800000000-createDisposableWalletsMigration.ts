import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class CreateDisposableWalletsMigration1775800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "disposable_wallets",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "user_id",
            type: "integer",
            isNullable: true,
          },
          {
            name: "address",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "network",
            type: "varchar",
          },
          {
            name: "token_symbol",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "destination_tag",
            type: "integer",
            isNullable: true,
          },
          {
            name: "derivation_index",
            type: "integer",
          },
          {
            name: "expected_amount",
            type: "decimal",
            precision: 36,
            scale: 18,
            isNullable: true,
          },
          {
            name: "received_amount",
            type: "decimal",
            precision: 36,
            scale: 18,
            default: 0,
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "funded", "swept", "expired", "failed"],
            default: "'pending'",
          },
          {
            name: "expires_at",
            type: "timestamp",
          },
          {
            name: "sweep_tx_hash",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "funding_tx_hash",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "funded_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "swept_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "now()",
          },
        ],
      }),
      true
    );

    // Create index on address for fast lookups
    await queryRunner.createIndex(
      "disposable_wallets",
      new TableIndex({
        name: "IDX_DISPOSABLE_WALLET_ADDRESS",
        columnNames: ["address"],
      })
    );

    // Create index on status for cron jobs
    await queryRunner.createIndex(
      "disposable_wallets",
      new TableIndex({
        name: "IDX_DISPOSABLE_WALLET_STATUS",
        columnNames: ["status"],
      })
    );

    // Create index on network
    await queryRunner.createIndex(
      "disposable_wallets",
      new TableIndex({
        name: "IDX_DISPOSABLE_WALLET_NETWORK",
        columnNames: ["network"],
      })
    );

    // Create index on expires_at for cleanup
    await queryRunner.createIndex(
      "disposable_wallets",
      new TableIndex({
        name: "IDX_DISPOSABLE_WALLET_EXPIRES_AT",
        columnNames: ["expires_at"],
      })
    );

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      "disposable_wallets",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "SET NULL",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("disposable_wallets");
    
    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("user_id") !== -1
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey("disposable_wallets", foreignKey);
      }
    }

    await queryRunner.dropIndex("disposable_wallets", "IDX_DISPOSABLE_WALLET_ADDRESS");
    await queryRunner.dropIndex("disposable_wallets", "IDX_DISPOSABLE_WALLET_STATUS");
    await queryRunner.dropIndex("disposable_wallets", "IDX_DISPOSABLE_WALLET_NETWORK");
    await queryRunner.dropIndex("disposable_wallets", "IDX_DISPOSABLE_WALLET_EXPIRES_AT");
    await queryRunner.dropTable("disposable_wallets");
  }
}
