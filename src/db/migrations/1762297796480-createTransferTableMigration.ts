import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTransferTableMigration1762297796480 implements MigrationInterface {
    name = 'CreateTransferTableMigration1762297796480'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "transfers" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "receiver_id" integer NOT NULL, "amount" double precision NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f712e908b465e0085b4408cabc3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "transfers" ADD CONSTRAINT "FK_ba27d1ebe999481ff98cfe51f6c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transfers" ADD CONSTRAINT "FK_8264e5f18e5cf3a017186e94a4c" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transfers" DROP CONSTRAINT "FK_8264e5f18e5cf3a017186e94a4c"`);
        await queryRunner.query(`ALTER TABLE "transfers" DROP CONSTRAINT "FK_ba27d1ebe999481ff98cfe51f6c"`);
        await queryRunner.query(`DROP TABLE "transfers"`);
    }

}
