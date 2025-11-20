import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePurchasesMigration1763476307461 implements MigrationInterface {
    name = 'CreatePurchasesMigration1763476307461'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "purchases" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "amount" numeric NOT NULL DEFAULT '0', "total" numeric NOT NULL DEFAULT '0', "commission" numeric NOT NULL DEFAULT '0', "country" character varying, "status" character varying NOT NULL DEFAULT 'pending', "provider" character varying, "fee" numeric, "type" character varying NOT NULL, "masamasa_ref" character varying, "other_ref" character varying, "recipient_name" text, "metadata" json, "others" json, "deleted_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_909b6e9bdc46e272f45609df5c8" UNIQUE ("masamasa_ref"), CONSTRAINT "PK_1d55032f37a34c6eceacbbca6b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD "google_id" character varying`);
        await queryRunner.query(`ALTER TABLE "purchases" ADD CONSTRAINT "FK_024ddf7e04177a07fcb9806a90a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchases" DROP CONSTRAINT "FK_024ddf7e04177a07fcb9806a90a"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_id"`);
        await queryRunner.query(`DROP TABLE "purchases"`);
    }

}
