import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Web3Service } from "./web3.service";
import { Wallet } from "../wallet/wallet.entity";

@Injectable()
export class WalletTrackingCron {
    private readonly logger = new Logger(WalletTrackingCron.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Wallet)
        private readonly walletRepository: Repository<Wallet>,
        private readonly web3Service: Web3Service,
    ) { }

    // Run wallet tracking every 3 minutes
    @Cron("*/5 * * * *")
    async trackAllWallets() {
        this.logger.log("START WALLET TRACKING FOR ALL USERS");

        try {
            // Get the highest user ID
            const lastUser = await this.userRepository
                .createQueryBuilder("user")
                .orderBy("user.id", "DESC")
                .limit(1)
                .getOne();

            if (!lastUser) {
                this.logger.log("No users found in the database");
                return;
            }

            const totalUsers = lastUser.id;
            this.logger.log(`Processing wallet tracking for ${totalUsers} users`);

            // Iterate from user ID 1 to the last user ID
            for (let userId = 1; userId <= totalUsers; userId++) {
                try {
                    await this.web3Service.walletsTracking({ user: { id: userId } });
                    await this.web3Service.sweepWallets({ user: { id: userId } });
                } catch (error) {
                    this.logger.error(
                        `Wallet tracking failed for user ${userId}:`,
                        error.message,
                    );
                    // Continue with next user even if one fails
                }
            }

            this.logger.log(`Wallet tracking completed for all ${totalUsers} users`);
        } catch (error) {
            this.logger.error("Error in wallet tracking worker:", error);
        }
    }

    /**
     * Auto-create wallets for users who don't have them yet
     * Runs every 10 minutes to ensure all users have wallets before sweep operations
     */
    @Cron("*/10 * * * *")
    async ensureAllUsersHaveWallets() {
        this.logger.log("START AUTO-CREATE WALLETS FOR USERS WITHOUT WALLETS");

        try {
            // Get all users
            const allUsers = await this.userRepository.find({
                select: ["id", "email"],
            });

            if (!allUsers || allUsers.length === 0) {
                this.logger.log("No users found in the database");
                return;
            }

            this.logger.log(`Checking ${allUsers.length} users for wallet creation`);

            let walletsCreatedCount = 0;

            // Check each user if they have wallets
            for (const user of allUsers) {
                try {
                    // Check if user has any wallet
                    const userWallets = await this.walletRepository.find({
                        where: { user: { id: user.id } },
                    });

                    // If user has no wallets, create them
                    if (!userWallets || userWallets.length === 0) {
                        this.logger.log(`Creating wallets for user ID ${user.id} (${user.email})`);

                        await this.web3Service.createWallet(
                            { user: { id: user.id } },
                            { id: user.id }
                        );

                        walletsCreatedCount++;
                        this.logger.log(`✅ Wallets created successfully for user ${user.id}`);
                    }
                } catch (error) {
                    this.logger.error(
                        `Failed to create wallets for user ${user.id}:`,
                        error.message,
                    );
                    // Continue with next user even if one fails
                }
            }

            if (walletsCreatedCount > 0) {
                this.logger.log(
                    `✅ Wallet creation completed. Created wallets for ${walletsCreatedCount} users`
                );
            } else {
                this.logger.log("All users already have wallets. No action needed.");
            }
        } catch (error) {
            this.logger.error("Error in auto-wallet creation worker:", error);
        }
    }
}
