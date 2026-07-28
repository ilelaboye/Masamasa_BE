import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression, Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, MoreThan, Not, Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Status, Wallet, WalletType } from "../wallet/wallet.entity";
import { QuidaxService } from "./quidax.service";
import { QUIDAX_CURRENCIES, toAppNetwork } from "./quidax.constants";

// Fiat wallets are never swept — only coins move to the master account.
const FIAT_CURRENCIES = new Set(["ngn", "usd", "ghs", "kes", "zar"]);

@Injectable()
export class QuidaxWalletCron {
  private readonly logger = new Logger(QuidaxWalletCron.name);
  private sweepRunning = false;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly quidaxService: QuidaxService,
  ) {}

  /**
   * Every 20 minutes: walk every sub-account and move any coin balance into
   * the master account. Safety net for deposits whose webhook-triggered
   * sweep failed or never fired.
   */
  // @Cron("*/20 * * * *")
  @Interval(10000)
  async sweepSubAccountsToMaster() {
    // A large user base can take longer than the interval — never overlap.
    if (this.sweepRunning) {
      this.logger.warn("Sub-account sweep still running — skipping this tick");
      return;
    }
    this.sweepRunning = true;

    try {
      const resp = await this.quidaxService.sweepToMasterAccount(
        "9fg51a5r",
        "USDT",
        "3",
        "trc20",
      );
      console.log("resp jjjf", resp);
      //  const resp = await this.quidaxService.createPaymentAddress(
      //   "9fg51a5r",
      //   "USDT",
      //   "polygon",
      // );
      // console.log("bccc", resp);
      // await this.quidaxService.sweepToMasterAccount("9fg51a5r", "USDT", "3");
      // const users = await this.userRepository.find({
      //   where: { quidax_id: Not(IsNull()) },
      //   select: ["id", "quidax_id"],
      // });
      // let sweptCount = 0;
      // for (const user of users) {
      //   const quidaxId = user.quidax_id;
      //   if (!quidaxId) continue;
      //   try {
      //     const wallets = await this.quidaxService.listWallets(quidaxId);
      //     await this.sleep(120);
      //     for (const wallet of wallets ?? []) {
      //       const balance = parseFloat(wallet.balance);
      //       const currency = (wallet.currency ?? "").toLowerCase();
      //       if (!currency || FIAT_CURRENCIES.has(currency)) continue;
      //       if (!balance || balance <= 0) continue;
      //       try {
      //         await this.quidaxService.sweepToMasterAccount(
      //           quidaxId,
      //           currency,
      //           wallet.balance,
      //         );
      //         sweptCount++;
      //       } catch (err) {
      //         this.logger.error(
      //           `Sweep failed for user ${user.id} (${wallet.balance} ${currency}): ${err?.response?.data?.message ?? err?.message}`,
      //         );
      //       }
      //       await this.sleep(120);
      //     }
      //   } catch (err) {
      //     this.logger.error(
      //       `Could not list wallets for user ${user.id}: ${err?.response?.data?.message ?? err?.message}`,
      //     );
      //   }
      // }
      // if (sweptCount > 0) {
      //   this.logger.log(
      //     `Sub-account sweep done — ${sweptCount} balance(s) moved to master`,
      //   );
      // }
    } catch (e) {
      console.log("llll", e);
    } finally {
      this.sweepRunning = false;
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
