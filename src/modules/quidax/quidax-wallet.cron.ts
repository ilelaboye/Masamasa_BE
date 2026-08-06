import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression, Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, MoreThan, Not, Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { Status, Wallet, WalletType } from "../wallet/wallet.entity";
import { QuidaxService } from "./quidax.service";
import { QUIDAX_CURRENCIES, toAppNetwork } from "./quidax.constants";
import { _IS_PROD_ } from "@/constants";

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
  @Cron("*/30 * * * *")
  async sweepSubAccountsToMaster() {
    if (!_IS_PROD_) return;
    // A large user base can take longer than the interval — never overlap.
    if (this.sweepRunning) {
      this.logger.warn("Sub-account sweep still running — skipping this tick");
      return;
    }
    this.sweepRunning = true;

    try {
      // const resp = await this.quidaxService.sweepToMasterAccount(
      //   "9fg51a5r",
      //   "USDT",
      //   "3",
      //   "trc20",
      // );
      // console.log("resp jjjf", resp);
      // console.log("bccc", resp);
      // await this.quidaxService.sweepToMasterAccount("9fg51a5r", "USDT", "3");
      const users = await this.userRepository.find({
        where: { quidax_id: Not(IsNull()) },
        select: ["id", "quidax_id"],
      });
      let sweptCount = 0;
      for (const user of users) {
        const quidaxId = user.quidax_id;
        if (!quidaxId) continue;
        try {
          const wallets = await this.quidaxService.listWallets(quidaxId);
          await this.sleep(120);
          for (const wallet of wallets ?? []) {
            const balance = parseFloat(wallet.balance);
            const currency = (wallet.currency ?? "").toLowerCase();
            if (!wallet.is_crypto || !currency) continue;
            if (FIAT_CURRENCIES.has(currency)) continue;
            if (!balance || balance <= 0) continue;

            // Pick the network to move the balance over. default_network is
            // NOT always withdrawable (e.g. SOL defaults to bep20 with
            // withdrawals disabled while solana is enabled), so validate it
            // against the networks list and fall back to the first network
            // that allows withdrawals.
            const networks = wallet.networks ?? [];
            const defaultNet = networks.find(
              (n) => n.id === wallet.default_network && n.withdraws_enabled,
            );
            const network = (
              defaultNet ?? networks.find((n) => n.withdraws_enabled)
            )?.id;

            if (!network) {
              this.logger.warn(
                `No withdrawable network for user ${user.id} ${currency} — skipping sweep`,
              );
              continue;
            }

            try {
              await this.quidaxService.sweepToMasterAccount(
                quidaxId,
                currency,
                wallet.balance,
                network,
              );
              sweptCount++;
            } catch (err) {
              this.logger.error(
                `Sweep failed for user ${user.id} (${wallet.balance} ${currency}/${network}): ${err?.response?.data?.message ?? err?.message}`,
              );
            }
            await this.sleep(120);
          }
        } catch (err) {
          this.logger.error(
            `Could not list wallets for user ${user.id}: ${err?.response?.data?.message ?? err?.message}`,
          );
        }
      }
      if (sweptCount > 0) {
        this.logger.log(
          `Sub-account sweep done — ${sweptCount} balance(s) moved to master`,
        );
      }
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
    if (!_IS_PROD_) return;
    console.log("START BACKFILLING");
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 3 * 1000);

    const users = await this.userRepository.find({
      where: { created_at: MoreThan(oneHourAgo) },
      select: ["id", "email", "first_name", "last_name", "phone", "quidax_id"],
    });

    if (!users.length) return;

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

        console.log(
          `User ${user.id}: creating ${missing.length} missing wallet(s)`,
          missing,
        );

        for (const { currency, network } of missing) {
          try {
            const addr = await this.quidaxService.createPaymentAddress(
              quidaxId,
              currency,
              network,
            );
            console.log("createPaymentAddress resp", addr);
            if (addr?.address) {
              await this.walletRepository.save({
                user_id: user.id,
                currency: currency.toUpperCase(),
                network: toAppNetwork(network ?? null, currency),
                wallet_address: addr.address,
                // Tag-based chains (XRP) need the destination tag alongside
                // the address
                destination_tag: addr.destination_tag ?? null,
                status: Status.active,
                type: WalletType.quidax,
              });
            }
          } catch (err) {
            console.error(
              `User ${user.id}: failed ${currency}${network ? `/${network}` : ""} — ${err?.message}`,
            );
          }
          // Respect Quidax's 10 req/s rate limit
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      } catch (err) {
        console.log("eeee", err.response.data);
        this.logger.error(
          `Wallet backfill failed for user ${user.id}: ${err?.message}`,
        );
      }
    }
  }
}
