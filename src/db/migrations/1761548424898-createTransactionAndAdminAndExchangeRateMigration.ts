import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTransactionAndAdminAndExchangeRateMigration1761548424898 implements MigrationInterface {
    name = 'CreateTransactionAndAdminAndExchangeRateMigration1761548424898'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "admin_logs" ("id" SERIAL NOT NULL, "entity" character varying, "note" text, "user_id" integer, "admin_id" integer NOT NULL, "visible" boolean NOT NULL DEFAULT false, "metadata" json, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bd116497b175ab12373dcb362b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."administrators_status_enum" AS ENUM('active', 'suspend')`);
        await queryRunner.query(`CREATE TABLE "administrators" ("id" SERIAL NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying, "status" "public"."administrators_status_enum" NOT NULL DEFAULT 'active', "address" character varying, "password" character varying NOT NULL, "last_seen" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_4ee5216a00cb99b2dede98509c1" UNIQUE ("email"), CONSTRAINT "PK_aaa48522d99c3b6b33fdea7dc2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."exchange_rates_status_enum" AS ENUM('active', 'disabled')`);
        await queryRunner.query(`CREATE TABLE "exchange_rates" ("id" SERIAL NOT NULL, "admin_id" integer NOT NULL, "rate" double precision NOT NULL DEFAULT '1', "status" "public"."exchange_rates_status_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_33a614bad9e61956079d817ebe2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_mode_enum" AS ENUM('credit', 'debit')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "amount" double precision DEFAULT '0', "dollar_amount" double precision DEFAULT '0', "exchange_rate_id" integer, "coin_amount" double precision NOT NULL DEFAULT '0', "network" character varying, "currency" character varying, "wallet_address" character varying, "mode" "public"."transactions_mode_enum" NOT NULL, "entity_type" character varying NOT NULL, "entity_id" character varying NOT NULL, "metadata" json, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "admin_logs" ADD CONSTRAINT "FK_7ace7c4b3262abd89cb75ae53b1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "admin_logs" ADD CONSTRAINT "FK_584393495a39db77ecbda33bccc" FOREIGN KEY ("admin_id") REFERENCES "administrators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "exchange_rates" ADD CONSTRAINT "FK_7a380c851b8dc1adbe2e3972f9d" FOREIGN KEY ("admin_id") REFERENCES "administrators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_2ddf8097edeba902d22283313e3" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_2ddf8097edeba902d22283313e3"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b"`);
        await queryRunner.query(`ALTER TABLE "exchange_rates" DROP CONSTRAINT "FK_7a380c851b8dc1adbe2e3972f9d"`);
        await queryRunner.query(`ALTER TABLE "admin_logs" DROP CONSTRAINT "FK_584393495a39db77ecbda33bccc"`);
        await queryRunner.query(`ALTER TABLE "admin_logs" DROP CONSTRAINT "FK_7ace7c4b3262abd89cb75ae53b1"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_mode_enum"`);
        await queryRunner.query(`DROP TABLE "exchange_rates"`);
        await queryRunner.query(`DROP TYPE "public"."exchange_rates_status_enum"`);
        await queryRunner.query(`DROP TABLE "administrators"`);
        await queryRunner.query(`DROP TYPE "public"."administrators_status_enum"`);
        await queryRunner.query(`DROP TABLE "admin_logs"`);
    }

}
