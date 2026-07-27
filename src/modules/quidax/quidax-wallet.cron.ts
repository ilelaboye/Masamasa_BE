import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Status, Wallet, WalletType } from "../wallet/wallet.entity";
import { QuidaxService } from "./quidax.service";
import { QUIDAX_CURRENCIES, toAppNetwork } from "./quidax.constants";

@Injectable()
export class QuidaxWalletCron {
  private readonly logger = new Logger(QuidaxWalletCron.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly quidaxService: QuidaxService,
  ) {}

  /**
   * Every hour: make sure users who registered within the last hour have a
   * wallet address for every accepted currency/network pair (registration
   * provisions them non-blocking, so a Quidax hiccup can leave gaps).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async backfillNewUserWallets() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const users = await this.userRepository.find({
      where: { created_at: MoreThan(oneHourAgo) },
      select: ["id", "email", "first_name", "last_name", "phone", "quidax_id"],
    });

    if (!users.length) return;

    this.logger.log(
      `Checking wallets for ${users.length} user(s) registered in the last hour`,
    );

    for (const user of users) {
      try {
        let quidaxId = user.quidax_id;
        if (!quidaxId) {
          const quidaxUser = await this.quidaxService.createSubAccount({
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone,
          });
          quidaxId = quidaxUser.id;
          await this.userRepository.update(
            { id: user.id },
            { quidax_id: quidaxId },
          );
        }

        const wallets = await this.walletRepository.find({
          where: { user_id: user.id },
        });
        const owned = new Set(
          wallets.map(
            (w) =>
              `${(w.currency ?? "").toUpperCase()}|${(w.network ?? "").toUpperCase()}`,
          ),
        );

        const missing = QUIDAX_CURRENCIES.filter(({ currency, network }) => {
          const appNetwork = toAppNetwork(network ?? null, currency);
          return !owned.has(
            `${currency.toUpperCase()}|${appNetwork.toUpperCase()}`,
          );
        });

        if (!missing.length) continue;

        this.logger.log(
          `User ${user.id}: creating ${missing.length} missing wallet(s)`,
        );

        for (const { currency, network } of missing) {
          try {
            const addr = await this.quidaxService.createPaymentAddress(
              quidaxId,
              currency,
              network,
            );
            if (addr?.address) {
              await this.walletRepository.save({
                user_id: user.id,
                currency: currency.toUpperCase(),
                network: toAppNetwork(network ?? null, currency),
                wallet_address: addr.address,
                status: Status.active,
                type: WalletType.quidax,
              });
            }
          } catch (err) {
            this.logger.error(
              `User ${user.id}: failed ${currency}${network ? `/${network}` : ""} — ${err?.message}`,
            );
          }
          // Respect Quidax's 10 req/s rate limit
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      } catch (err) {
        this.logger.error(
          `Wallet backfill failed for user ${user.id}: ${err?.message}`,
        );
      }
    }
  }
}
