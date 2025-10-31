import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueToWalletAddressMigration1761893946466 implements MigrationInterface {
    name = 'AddUniqueToWalletAddressMigration1761893946466'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "webhooks" ADD "address" character varying`);
        await queryRunner.query(`ALTER TABLE "wallet" ADD CONSTRAINT "UQ_476a9a59985bc92d1d91db035d9" UNIQUE ("wallet_address")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wallet" DROP CONSTRAINT "UQ_476a9a59985bc92d1d91db035d9"`);
        await queryRunner.query(`ALTER TABLE "webhooks" DROP COLUMN "address"`);
    }

}
