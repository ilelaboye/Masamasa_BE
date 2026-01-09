import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAccessTokenMigration1767815655611 implements MigrationInterface {
  name = "CreateAccessTokenMigration1767815655611";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "access_tokens" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "token" character varying NOT NULL, "refresh_token" character varying, "metadata" json, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_65140f59763ff994a0252488166" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "access_tokens"`);
  }
}
