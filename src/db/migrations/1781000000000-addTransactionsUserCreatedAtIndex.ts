import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `transactions` had no index beyond its primary key — Postgres does not
 * create one for a foreign key column — so every history page and every
 * balance calculation seq-scanned the whole table.
 *
 * The composite index matches the shape of both queries:
 *  - GET /transactions: WHERE user_id = $1 [AND created_at range]
 *                       ORDER BY created_at DESC, id DESC LIMIT/OFFSET
 *  - getAccountBalance: SUM(...) WHERE user_id = $1
 *
 * Column order matters: user_id first (equality) then created_at (range and
 * sort), so a page is an index range scan with no sort step. `id` closes the
 * pagination tie-breaker so the ordering is fully index-served.
 */
export class AddTransactionsUserCreatedAtIndex1781000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_user_id_created_at" ON "transactions" ("user_id", "created_at" DESC, "id" DESC)`,
    );
    // Supports the exchange_rate join on the history page, and any cascade
    // check on the exchange_rates side.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_exchange_rate_id" ON "transactions" ("exchange_rate_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_exchange_rate_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_user_id_created_at"`,
    );
  }
}
