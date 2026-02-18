import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Web3Service } from "./web3.service";

@Injectable()
export class WalletTrackingCron {
    private readonly logger = new Logger(WalletTrackingCron.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
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
                    // await this.web3Service.walletsTracking({ user: { id: userId } });
                    // await this.web3Service.sweepWallets({ user: { id: userId } });
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
}
