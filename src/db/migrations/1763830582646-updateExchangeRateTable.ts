import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateExchangeRateTable1763830582646
  implements MigrationInterface
{
  name = "UpdateExchangeRateTable1763830582646";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "exchange_rates" ADD "currency" character varying NOT NULL DEFAULT 'btc'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "exchange_rates" DROP COLUMN "currency"`
    );
  }
}
