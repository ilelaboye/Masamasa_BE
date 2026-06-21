import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddExpiredAtToWalletTable1775900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "wallet",
      new TableColumn({
        name: "expired_at",
        type: "timestamp",
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("wallet", "expired_at");
  }
}
