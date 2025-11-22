import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBankVerificationMigration1763640090752 implements MigrationInterface {
    name = 'CreateBankVerificationMigration1763640090752'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "beneficiaries" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "bank_code" character varying NOT NULL, "bank_name" character varying NOT NULL, "account_name" character varying NOT NULL, "account_number" character varying NOT NULL, "user_id" integer NOT NULL, CONSTRAINT "PK_c9356d282dec80f7f12a9eef10a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."bank_verifications_type_enum" AS ENUM('bvn', 'other', 'accountNumber')`);
        await queryRunner.query(`CREATE TABLE "bank_verifications" ("id" SERIAL NOT NULL, "type" "public"."bank_verifications_type_enum" NOT NULL, "value" character varying NOT NULL, "hashed_value" character varying, "metadata" json, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d9473f7df0914efeb89319e58bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "beneficiaries" ADD CONSTRAINT "FK_38906de3393c7787c3c89e29d3b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "beneficiaries" DROP CONSTRAINT "FK_38906de3393c7787c3c89e29d3b"`);
        await queryRunner.query(`DROP TABLE "bank_verifications"`);
        await queryRunner.query(`DROP TYPE "public"."bank_verifications_type_enum"`);
        await queryRunner.query(`DROP TABLE "beneficiaries"`);
    }

}
