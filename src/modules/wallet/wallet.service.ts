import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { Status, Wallet } from "./wallet.entity";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  async findAll(req: UserRequest) {
    // Get all non-expired wallets for the user, ordered by creation date
    const wallets = await this.walletRepository
      .createQueryBuilder("wallet")
      .where("wallet.user_id = :userId", { userId: req.user.id })
      .andWhere("wallet.expired_at IS NULL")
      .orderBy("wallet.created_at", "ASC")
      .getMany();

    // Group by network and currency, keeping only the earliest wallet
    const uniqueWallets = new Map<string, Wallet>();

    for (const wallet of wallets) {
      const key = `${wallet.network}_${wallet.currency}`;

      if (!uniqueWallets.has(key)) {
        uniqueWallets.set(key, wallet);
      }
    }

    return Array.from(uniqueWallets.values());
  }

  async findExpiredWallets(req: UserRequest) {
    // Get all wallets that have expired_at set (disposable/temporary wallets)
    return await this.walletRepository
      .createQueryBuilder("wallet")
      .where("wallet.user_id = :userId", { userId: req.user.id })
      .andWhere("wallet.expired_at IS NOT NULL")
      .orderBy("wallet.created_at", "DESC")
      .getMany();
  }
}
