import { appConfig } from "@/config";
import {
  DEPOSIT_FEE_EXEMPT_CURRENCIES,
  DEPOSIT_FEE_USD,
  MAILJETTemplates,
  ZohoMailTemplates,
} from "@/constants";
import {
  axiosClient,
  getBanks,
  getRequestQuery,
  sendMailJetWithTemplate,
  sendZohoMailWithTemplate,
  sendWithdrawalSuccessEmail,
} from "@/core/utils";
import { User } from "@/modules/users/entities/user.entity";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BankAccountVerificationDto } from "./dto";
import { Status, Wallet, WalletType } from "@/modules/wallet/wallet.entity";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { Webhook, WebhookEntityType } from "./entities/webhook.entity";
import axios from "axios";
import { createHash } from "crypto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { NotificationTag } from "@/modules/notifications/entities/notification.entity";
import {
  AccessToken,
  AccessTokenType,
} from "../bank-verification/entities/access-token.entity";
import { CronJob } from "../jobs/cron/cron.job";
import {
  toAppNetwork,
  toQuidaxNetwork,
} from "@/modules/quidax/quidax.constants";
import { QuidaxService } from "@/modules/quidax/quidax.service";
import { CacheService } from "../cache-container/cache-container.service";
import { ReferralsService } from "@/modules/referrals/referrals.service";
import { MixpanelService } from "../mixpanel/mixpanel.service";
import {
  capitalizeString,
  compareVersions,
  currencyFormatter,
  generateMasamasaRef,
} from "@/core/helpers";

// Nomba's bank list rarely changes — cached under this key for all users.
const NOMBA_BANKS_CACHE_KEY = "NOMBA_BANKS_LIST";

// Coins pegged 1:1 to the US dollar — priced locally instead of via CoinGecko.
const STABLECOINS_USD = new Set(["usdt", "usdc"]);

// Naira-quoted coins. Their `exchange_rates` row holds the naira price of one
// coin — not the naira-per-dollar rate every other row holds — so their value
// is read straight off that row instead of the market price feed.
const NAIRA_QUOTED_COINS = new Set(["cngn"]);

// CoinGecko id → the key /prices returns it under. The app reads these keys,
// so they are a contract with shipped builds.
const PRICE_FEED: Record<string, string> = {
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  binancecoin: "binancecoin",
  solana: "solana",
  tether: "tether",
  "usd-coin": "usd-coin",
  cardano: "cardano",
  dogecoin: "doge",
  ripple: "ripple",
  "polygon-ecosystem-token": "pol",
  tron: "tron",
  "compliant-naira": "cngn",
};

// Deposit ticker → its key in the price feed. A fixed table rather than
// CoinGecko's search, which cost a call per deposit and can pick a look-alike.
const TICKER_TO_PRICE_KEY: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  bnb: "binancecoin",
  sol: "solana",
  ada: "cardano",
  doge: "doge",
  xrp: "ripple",
  pol: "pol",
  matic: "pol",
  trx: "tron",
};

// Every price read is served from one cached CoinGecko call, refreshed at
// most every 5 minutes: ~8,600 calls a month, inside the Demo plan's 10k.
const PRICES_CACHE_KEY = "COINGECKO_PRICES";
const PRICES_MAX_AGE_MS = 5 * 60 * 1000;

type PriceFeed = Record<
  string,
  { usd: number; change_24h: number; direction: "up" | "down" }
>;

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepository: Repository<AccessToken>,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly notificationsService: NotificationsService,
    private readonly cronJob: CronJob,
    private readonly quidaxService: QuidaxService,
    private readonly cacheService: CacheService,
    private readonly mixpanel: MixpanelService,
    private readonly referralsService: ReferralsService,
  ) {}

  async flutterwaveTransferWebhook(webhook) {
    if (webhook["event.type"] == "Transfer") {
      const transaction = await this.transactionsRepository
        .createQueryBuilder("trans")
        .where("masamasa_ref = :ref", { ref: webhook.data.reference })
        .getOne();

      if (transaction) {
        if (webhook.data.status == "FAILED") {
          this.transactionsRepository.update(
            { id: transaction.id },
            { status: TransactionStatusType.failed },
          );
        }
      }
    }
  }

  async nombaTransferWebhook(webhook) {
    console.log("Nomba webhook", webhook);
    // console.log(
    //   "webhook.data.transaction.merchantTxRef",
    //   webhook.data.transaction.merchantTxRef
    // );
    if (Object.entries(webhook).length > 0) {
      const transaction = await this.transactionsRepository
        .createQueryBuilder("trans")
        .where("trans.entity_type = :entityType", {
          entityType: TransactionEntityType.withdrawal,
        })
        .andWhere("trans.masamasa_ref = :ref", {
          ref: webhook.data.transaction.merchantTxRef,
        })
        .getOne();
      // return transaction;
      console.log("Nomba webhook transaction", transaction);
      if (transaction) {
        if (webhook.event_type == "payout_success") {
          // Only act on a real transition — Nomba can redeliver this
          // webhook, and the user must not be emailed twice.
          const alreadySettled =
            transaction.status === TransactionStatusType.success;

          await this.transactionsRepository.update(
            { id: transaction.id },
            {
              status: TransactionStatusType.success,
              metadata: { ...transaction.metadata, nomba_resp: webhook.data },
            },
          );

          if (!alreadySettled) {
            await this.notifyWithdrawalSuccess(transaction);
          }

          // Analytics: measured to the bank confirmation callback, per the
          // tracking plan. Bank code only — never the account number.
          this.mixpanel.track("payout completed", transaction.user_id, {
            "payout id": transaction.masamasa_ref,
            "amount ngn": Number(transaction.amount) || 0,
            "bank code": transaction.metadata?.bankCode,
            "time to payout seconds": Math.round(
              (Date.now() - new Date(transaction.created_at).getTime()) / 1000,
            ),
          });
        } else if (
          webhook.event_type == "payout_failed" ||
          webhook.event_type == "payout_refund"
        ) {
          this.transactionsRepository.update(
            { id: transaction.id },
            {
              status: TransactionStatusType.failed,
              metadata: { ...transaction.metadata, nomba_resp: webhook.data },
            },
          );

          this.mixpanel.track("payout failed", transaction.user_id, {
            "payout id": transaction.masamasa_ref,
            "amount ngn": Number(transaction.amount) || 0,
            "bank code": transaction.metadata?.bankCode,
            "failure reason code":
              webhook.event_type == "payout_refund"
                ? "BANK_REVERSED"
                : "BANK_REJECTED",
          });
        }
      }
    }

    return true;
  }

  async getPrice(symbol): Promise<{ status: boolean; price: any }> {
    // try {
    //   const price = await axios.get(
    //     `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    //   );
    //   return { status: true, price: price.data };
    // } catch {
    //   return { status: false };
    // }
    const ticker = String(symbol ?? "").toLowerCase();
    // Dollar-pegged stablecoins are always $1 — skip the lookup entirely.
    if (STABLECOINS_USD.has(ticker)) {
      return { status: true, price: 1 };
    }

    // Read off the cached feed /prices serves, so a deposit costs no call.
    const key = TICKER_TO_PRICE_KEY[ticker];
    if (!key) {
      this.logger.error(`No price feed entry for ${symbol}`);
      return { status: false, price: null };
    }
    try {
      const { data } = await this.getPrices();
      const usd = data[key]?.usd;
      // The feed writes 0 for a missing price; 0 is never a real price.
      return usd
        ? { status: true, price: usd }
        : { status: false, price: null };
    } catch {
      return { status: false, price: null };
    }
  }

  /**
   * What one unit of `currency` is worth, given `rate` — the coin's own
   * `exchange_rates` value.
   *
   * A naira-quoted coin (cNGN) carries its naira price per coin in that row, so
   * the credited naira comes off the row directly — no dollar round trip, which
   * would lose value to rounding. Its `coinPrice` is derived from the USDT rate
   * for reporting only (`dollar_amount` feeds referral qualification and admin
   * volume); it never touches the naira credited.
   *
   * Every other coin prices in dollars off the feed and converts at its own rate.
   */
  private async getCoinPricing(
    currency: string,
    rate: number,
  ): Promise<{ coinPrice: number; nairaPerCoin: number }> {
    if (!NAIRA_QUOTED_COINS.has(String(currency ?? "").toLowerCase())) {
      const price = await this.getPrice(currency);
      const coinPrice = price.status ? (price.price ?? 0) : 0;
      return { coinPrice, nairaPerCoin: coinPrice * rate };
    }

    const usdt = await this.exchangeRateService.getCurrencyActiveRate("usdt");
    const usdtRate = usdt?.rate ?? 0;
    return {
      coinPrice: usdtRate > 0 ? rate / usdtRate : 0,
      nairaPerCoin: rate,
    };
  }

  async getPrices() {
    // Binance does not work in USA
    // try {
    //   const symbols = ["BTCUSDT", "ETHUSDT", "ADAUSDT"];
    //   const responses = await Promise.all(
    //     symbols.map((symbol) =>
    //       axios.get(
    //         `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    //       )
    //     )
    //   );

    //   const prices = responses.map((res) => ({
    //     symbol: res.data.symbol,
    //     price: parseFloat(res.data.price),
    //   }));

    //   return prices;
    // } catch (error) {
    //   console.log(error);
    //   throw new BadRequestException("Failed to fetch prices");
    // }

    const cached = await this.cacheService.get<{ at: number; data: PriceFeed }>(
      PRICES_CACHE_KEY,
    );
    if (cached && Date.now() - cached.at < PRICES_MAX_AGE_MS) {
      return { success: true, data: cached.data };
    }

    try {
      // Shared so requests arriving together at expiry make one call, not many.
      this.pricesInFlight ??= this.fetchPrices().finally(
        () => (this.pricesInFlight = null),
      );
      const data = await this.pricesInFlight;
      this.cacheService.set(PRICES_CACHE_KEY, { at: Date.now(), data });
      return { success: true, data };
    } catch (error) {
      // A few minutes old beats none. Survives as long as the store keeps the
      // key (its 20-minute default; the ttl argument is ignored).
      if (cached) return { success: true, data: cached.data };
      this.logger.error(
        `CoinGecko prices failed: ${(error as Error)?.message}`,
      );
      throw new BadRequestException("Failed to fetch prices");
    }
  }

  private pricesInFlight: Promise<PriceFeed> | null = null;

  private async fetchPrices() {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/coins/markets",
      {
        params: {
          vs_currency: "usd",
          ids: Object.keys(PRICE_FEED).join(","),
          price_change_percentage: "24h",
        },
        headers: appConfig.COINGECKO_API_KEY
          ? { "x-cg-demo-api-key": appConfig.COINGECKO_API_KEY }
          : {},
        timeout: 15000,
      },
    );

    const data: PriceFeed = {};
    response.data.forEach((coin) => {
      const key = PRICE_FEED[coin.id];
      if (!key) return;
      // CoinGecko sends null for coins without 24h data (cNGN today). Shipped
      // apps hard-cast these to num, so a null crashes their login.
      const change = coin.price_change_percentage_24h ?? 0;
      data[key] = {
        usd: coin.current_price ?? 0,
        change_24h: change,
        direction: change >= 0 ? "up" : "down",
      };
    });
    return data;
  }

  async getBanksFromNomba() {
    // Bank list rarely changes — serve from cache and only hit Nomba on a miss.
    const cached = await this.cacheService.get(NOMBA_BANKS_CACHE_KEY);
    if (cached) return cached;

    let accessToken = await this.accessTokenRepository.findOne({
      where: { type: AccessTokenType.nomba },
    });
    if (!accessToken) {
      await this.cronJob.generateNombaAccessToken();
      accessToken = await this.accessTokenRepository.findOne({
        where: { type: AccessTokenType.nomba },
      });
    }
    if (!accessToken) {
      throw new BadRequestException(
        "Unable to authenticate with the bank provider, please try again",
      );
    }

    try {
      const resp = await axiosClient(
        `${appConfig.NOMBA_BASE_URL}/v1/transfers/banks`,
        {
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            accountId: appConfig.NOMBA_ACCOUNT_ID,
          },
        },
      );

      // 24h TTL (falls back to the cache default if ttl is ignored).
      this.cacheService.set(
        NOMBA_BANKS_CACHE_KEY,
        resp.data,
        24 * 60 * 60 * 1000,
      );

      return resp.data;
    } catch (error: any) {
      console.log("banks", error);
      throw new BadRequestException(error.response.data.description);
    }
  }

  /**
   * Supported app versions per platform. The app calls this on launch and
   * blocks the user behind an update prompt when it is not running the newest
   * release — every release is mandatory, patch releases included, so a client
   * on 2.0.0 is forced to update as soon as 2.0.1 ships.
   *
   * Because of that, `*_LATEST_VERSION` must only be bumped once the build is
   * actually downloadable from the store; raising it early hard-blocks every
   * user until the rollout completes.
   */
  getAppVersion(platform?: string, currentVersion?: string) {
    const isIos = (platform ?? "").toLowerCase() === "ios";

    const minVersion = isIos
      ? appConfig.IOS_MIN_VERSION
      : appConfig.ANDROID_MIN_VERSION;
    const latestVersion = isIos
      ? appConfig.IOS_LATEST_VERSION
      : appConfig.ANDROID_LATEST_VERSION;
    const storeUrl = isIos
      ? appConfig.IOS_STORE_URL
      : appConfig.ANDROID_STORE_URL;

    // Compare only when the client sends a well-formed version. An absent
    // or unparseable value must never lock a user out of the app.
    const clientVersion = (currentVersion ?? "").trim();
    const isValidVersion = /^\d+(\.\d+)*$/.test(clientVersion);

    let forceUpdate = false;
    let updateAvailable = false;
    if (isValidVersion) {
      // Trailing the latest release is enough to force an update — comparing
      // against min_version alone let a client sit on 2.0.0 after 2.0.1 shipped,
      // since it was not below the minimum.
      //
      // The two are still compared separately rather than just using the
      // latest: if the env vars are ever set with min_version above
      // latest_version, falling behind the minimum must still force.
      const behindMinimum = compareVersions(clientVersion, minVersion) < 0;
      const behindLatest = compareVersions(clientVersion, latestVersion) < 0;

      forceUpdate = behindMinimum || behindLatest;
      updateAvailable = behindLatest;
    }

    return {
      platform: isIos ? "ios" : "android",
      min_version: minVersion,
      latest_version: latestVersion,
      store_url: storeUrl,
      force_update: forceUpdate,
      update_available: updateAvailable,
      message:
        "A new version of MasaMasa is available. Please update to continue.",
    };
  }

  async getBanks() {
    // return getBanks();
    return await this.getBanksFromNomba();
  }

  async verifyAccountNumberFromNomba(accountNumber, bankCode, bankName) {
    let accessToken = await this.accessTokenRepository.findOne({
      where: { type: AccessTokenType.nomba },
    });

    if (!accessToken) {
      accessToken = await this.cronJob.generateNombaAccessToken();
    }

    try {
      const res = await axiosClient(
        `${appConfig.NOMBA_BASE_URL}/v1/transfers/bank/lookup`,
        {
          method: "POST",
          body: {
            accountNumber: accountNumber,
            bankCode: bankCode,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            accountId: appConfig.NOMBA_ACCOUNT_ID,
            Authorization: `Bearer ${accessToken!.token}`,
          },
        },
      );
      console.log("Nomba bank lookup", res);
      return {
        message: "Account number verified",
        data: {
          bank_name: bankName,
          account_name: res.data.accountName,
          account_number: accountNumber,
        },
      };
    } catch (e: any) {
      console.log("Error loop bank details from Nomba:", e);
      // // this.monitorService.recordError(e);

      throw new BadRequestException(e.response.data.description);
    }
  }

  async verifyAccountNumberFromClan(accountNumber, bankCode, bankName) {
    try {
      const response = await axiosClient(
        `https://mobile.creditclan.com/webapi/v1/account/resolve`,
        {
          method: "POST",
          body: {
            bank_code: bankCode,
            account_number: accountNumber,
          },
          headers: { "x-api-key": `${appConfig.CLAN_TOKEN}` },
        },
      );
      if (!response.status)
        throw new BadRequestException("Account number verification failed");

      return {
        message: "Account number verified",
        data: { bank_name: bankName, ...response.data },
      };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  async verifyAccountNumber(
    bankAccountVerificationDto: BankAccountVerificationDto,
  ) {
    const { accountNumber, bankCode, bankName } = bankAccountVerificationDto;
    return this.verifyAccountNumberFromNomba(accountNumber, bankCode, bankName);
    // return this.verifyAccountNumberFromClan(accountNumber, bankCode, bankName);
  }

  async test(req: Request) {
    console.log("test", req);
    // const { search } = getRequestQuery(req);
    // let accessToken = await this.accessTokenRepository.findOne({
    //   where: { type: AccessTokenType.nomba },
    // });

    // if (!accessToken) {
    //   accessToken = await this.cronJob.generateNombaAccessToken();
    // }
    // try {
    //   const res = await axiosClient(
    //     `${appConfig.NOMBA_BASE_URL}/v1/transactions/accounts/single?merchantTxRef=${search}`,
    //     {
    //       headers: {
    //         "Content-Type": "application/json",
    //         Accept: "application/json",
    //         accountId: appConfig.NOMBA_ACCOUNT_ID,
    //         Authorization: `Bearer ${accessToken!.token}`,
    //       },
    //     },
    //   );
    //   console.log("Nomba bank verify transfer", res.data);
    //   return res.data;

    //   // const priceResult = await this.getPrice("POL");
    //   // console.log("priceResult", priceResult);
    //   // return priceResult;
    //   // const res = await axios.get(
    //   //   `https://openapi.quidax.io/exchange-open-api/api/v1/users/1cs4v97s/wallets/xrp`,

    //   //   {
    //   //     headers: {
    //   //       Authorization: `Bearer ZSKTsErViB1iY2nfVgzS6nv26kJLAjqL`,
    //   //       "Content-Type": "application/json",
    //   //     },
    //   //     timeout: 15000,
    //   //   },
    //   // );
    //   // console.log("quidax test", res);
    //   // return res;
    // } catch (error: any) {
    //   console.log("quidax test error", error.response?.data);
    //   console.log("quidax test error", error);
    // }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleQuidaxWebhook(payload: any): Promise<void> {
    const { event, data } = payload ?? {};
    if (!event || !data) return;

    // ── Idempotency ─────────────────────────────────────────────────────
    // Quidax retries webhooks, so each event must be processed exactly
    // once. Claim the event by inserting a marker with a unique hash BEFORE
    // processing; a duplicate delivery (even concurrent) hits the unique
    // constraint and is skipped. If processing fails, the marker is removed
    // so Quidax's retry can run the handler again.
    const eventKey = `qx:${event}:${
      data.id ??
      createHash("sha256").update(JSON.stringify(payload)).digest("hex")
    }`;

    const seen = await this.webhookRepository.findOne({
      where: { hash: eventKey },
    });
    if (seen) {
      console.log(`Duplicate Quidax webhook skipped: ${eventKey}`);
      return;
    }

    let marker: Webhook;
    try {
      marker = await this.webhookRepository.save({
        hash: eventKey,
        entity_type: WebhookEntityType.quidax_event,
        metadata: payload,
      });
    } catch {
      console.log(`Duplicate Quidax webhook skipped (race): ${eventKey}`);
      return;
    }

    try {
      await this.dispatchQuidaxEvent(event, data);
    } catch (err) {
      await this.webhookRepository.delete({ id: marker.id }).catch(() => {});
      throw err;
    }
  }

  private async dispatchQuidaxEvent(event: string, data: any): Promise<void> {
    switch (event) {
      case "wallet.address.generated":
        return this.handleWalletAddressGenerated(data);
      case "wallet.updated":
        // Balance change event — fires on incoming deposit or outgoing transfer.
        // Deposit records are created by deposit.* events; we only audit-log here.
        return this.handleWalletUpdated(data);
      case "deposit.transaction.confirmation":
        return this.handleDepositTransactionConfirmation(data);
      case "deposit.successful":
        return this.handleDepositSuccessful(data);
      case "deposit.on_hold":
        return this.handleDepositOnHold(data);
      case "deposit.failed_aml":
      case "deposit.rejected":
        return this.handleDepositFailed(data, event);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleWalletAddressGenerated(data: any): Promise<void> {
    const {
      currency,
      address,
      network,
      destination_tag,
      user: quidaxUser,
    } = data;
    console.log(currency, address, network, quidaxUser);
    if (!address || !quidaxUser?.id) return;

    console.log(
      `[QuidaxWebhook] wallet.address.generated — user: ${quidaxUser.id}, currency: ${currency}, network: ${network}, address: ${address}`,
    );

    const user = await this.userRepository.findOne({
      where: { quidax_id: quidaxUser.id },
    });
    if (!user) return;

    // Convert Quidax network id (e.g. "trc20") to app format (e.g. "TRON")
    const appNetwork = toAppNetwork(network, currency);

    // Idempotency key is (user_id, network, currency) — NOT wallet_address,
    // because EVM-compatible chains (Ethereum, BSC, Base, Polygon) share the
    // same address, so checking by address alone would skip valid records.
    const existingWallet = await this.walletRepository.findOne({
      where: {
        user_id: user.id,
        network: appNetwork,
        currency,
        status: Status.active,
      },
    });

    if (existingWallet) {
      console.log(
        `[QuidaxWebhook] wallet already exists for user ${user.id} (${currency}/${appNetwork})`,
      );
      if (!existingWallet.wallet_address) {
        await this.walletRepository.update(
          { id: existingWallet.id },
          { wallet_address: address, destination_tag: destination_tag ?? null },
        );
      }
    } else {
      await this.walletRepository.save({
        user_id: user.id,
        network: appNetwork,
        currency,
        wallet_address: address,
        destination_tag: destination_tag ?? null,
        status: Status.active,
        type: WalletType.quidax,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleWalletUpdated(data: any): void {
    this.logger.log(
      `wallet.updated — user: ${data?.user?.id}, currency: ${data?.currency}, balance: ${data?.balance}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractDepositFields(data: any) {
    return {
      depositId: data.id as string, // idempotency key
      txid: data.txid as string, // blockchain hash (metadata only)
      currency: data.currency as string,
      amount: data.amount as string,
      address: data.payment_address?.address as string, // the user's deposit address
      // Tag-based chains (XRP) share one master address — the tag is what
      // identifies the user's wallet row.
      destinationTag: (data.payment_address?.destination_tag ?? null) as
        | string
        | null,
      network: data.payment_address?.network as string,
    };
  }

  /**
   * Emails + in-app notifies the user that a bank withdrawal was paid out.
   * Fire-and-forget; a notification failure must not fail the webhook.
   */
  private async notifyWithdrawalSuccess(transaction: Transactions) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: transaction.user_id },
      });
      if (!user) return;

      sendWithdrawalSuccessEmail(user, {
        amount: Number(transaction.amount) || 0,
        bankName: transaction.metadata?.bankName,
        accountNumber: transaction.metadata?.accountNumber,
        reference: transaction.masamasa_ref,
      });

      await this.notificationsService.create({
        userId: transaction.user_id,
        message: `Your withdrawal of NGN ${Number(transaction.amount ?? 0).toLocaleString("en-NG")} was successful`,
        tag: NotificationTag.withdrawal,
        pushTitle: "Withdrawal Successful",
        metadata: { reference: transaction.masamasa_ref },
      });
    } catch (err: any) {
      this.logger.warn(
        `Withdrawal notification failed for ${transaction.masamasa_ref}: ${err?.message}`,
      );
    }
  }

  /**
   * Finds the wallet row a deposit belongs to.
   *
   * An address alone is ambiguous: every token on a chain shares one
   * address (USDT, USDC and ETH all sit on the same EVM address), so the
   * currency must match too or the deposit is credited against the wrong
   * wallet row. For tag-based chains (XRP) the shared master address needs
   * the destination tag as well.
   *
   * Currency is compared case-insensitively — rows written during Quidax
   * provisioning are uppercase while webhook-created rows are lowercase.
   */
  private findDepositWallet(
    address: string,
    currency: string,
    destinationTag: string | null,
    withUser = false,
  ) {
    const query = this.walletRepository
      .createQueryBuilder("wallet")
      .where("wallet.wallet_address = :address", { address })
      .andWhere("UPPER(wallet.currency) = :currency", {
        currency: String(currency ?? "").toUpperCase(),
      });

    if (destinationTag) {
      query.andWhere("wallet.destination_tag = :destinationTag", {
        destinationTag,
      });
    }

    if (withUser) {
      query.leftJoinAndSelect("wallet.user", "user");
    }

    return query.getOne();
  }

  // Incoming TX detected on-chain — not yet confirmed.
  // Creates a processing transaction so the user sees the pending deposit immediately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositTransactionConfirmation(data: any): Promise<void> {
    const { depositId, currency, amount, address, network, destinationTag } =
      this.extractDepositFields(data);
    if (!depositId || !address) return;

    // Idempotency — skip if deposit.successful already beat us to it
    const existingWebhook = await this.webhookRepository.findOne({
      where: { hash: depositId },
    });
    if (existingWebhook) return;

    const wallet = await this.findDepositWallet(
      address,
      currency,
      destinationTag,
    );
    if (!wallet) return;

    // Quidax often omits payment_address.network (always for native coins) —
    // the wallet row looked up by address is the authoritative network.
    const depositNetwork = wallet.network ?? toAppNetwork(network, currency);

    // Analytics: asset + network as labels only — never the wallet address
    // or transaction hash (Do Not Send).
    this.mixpanel.track("crypto deposit detected", wallet.user_id, {
      asset: (currency ?? "").toUpperCase(),
      network: depositNetwork,
    });

    const wb = await this.webhookRepository.save({
      address,
      entity_type: WebhookEntityType.deposit,
      hash: depositId,
      metadata: data,
    });

    await this.transactionsRepository.save({
      user_id: wallet.user_id,
      network: depositNetwork,
      coin_amount: parseFloat(amount) || 0,
      wallet_address: address,
      mode: TransactionModeType.credit,
      entity_type: TransactionEntityType.deposit,
      metadata: data,
      currency,
      entity_id: wb.id,
      dollar_amount: 0,
      amount: 0,
      coin_exchange_rate: 0,
      status: TransactionStatusType.processing,
    } as unknown as Transactions);

    this.notificationsService.create({
      userId: wallet.user_id,
      message: `Incoming ${currency.toUpperCase()} deposit of ${currencyFormatter(amount, "NGN", 2, false)} detected — awaiting blockchain confirmation`,
      tag: NotificationTag.deposit,
      pushTitle: "Deposit Detected",
      metadata: data,
    });
  }

  // Blockchain has confirmed the deposit.
  // If deposit.transaction.confirmation already ran → upgrade the processing
  // transaction to success with real amounts.
  // If not (confirmation missed) → create a fresh success transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositSuccessful(data: any): Promise<void> {
    const { depositId, currency, amount, address, network, destinationTag } =
      this.extractDepositFields(data);
    if (!depositId || !address) return;

    const wallet = await this.findDepositWallet(
      address,
      currency,
      destinationTag,
      true,
    );
    if (!wallet) return;

    // Quidax often omits payment_address.network (always for native coins) —
    // the wallet row looked up by address is the authoritative network.
    const depositNetwork = wallet.network ?? toAppNetwork(network, currency);

    const rate = await this.exchangeRateService.getCurrencyActiveRate(
      currency.toLowerCase(),
    );
    const exchange = rate?.rate ?? 0;
    const { coinPrice, nairaPerCoin } = await this.getCoinPricing(
      currency,
      exchange,
    );
    const coinAmount = parseFloat(amount) || 0;
    const dollarAmount = coinPrice * coinAmount;
    const nairaAmount = nairaPerCoin * coinAmount;

    const existingWebhook = await this.webhookRepository.findOne({
      where: { hash: depositId },
    });

    let webhookEntityId: number;

    if (existingWebhook) {
      webhookEntityId = existingWebhook.id;
      // Upgrade the processing record created by deposit.transaction.confirmation
      await this.transactionsRepository
        .createQueryBuilder()
        .update(Transactions)
        .set({
          status: TransactionStatusType.success,
          network: depositNetwork,
          dollar_amount: dollarAmount,
          amount: nairaAmount,
          coin_exchange_rate: coinPrice,
          exchange_rate_id: rate ? rate.id : null,
          metadata: data,
        })
        .where("entity_id = :entityId", { entityId: existingWebhook.id })
        .andWhere("entity_type = :type", {
          type: TransactionEntityType.deposit,
        })
        .andWhere("status = :status", {
          status: TransactionStatusType.processing,
        })
        .execute();
    } else {
      // Confirmation event was missed — create a fresh success transaction
      const wb = await this.webhookRepository.save({
        address,
        entity_type: WebhookEntityType.deposit,
        hash: depositId,
        metadata: data,
      });
      webhookEntityId = wb.id;

      await this.transactionsRepository.save({
        user_id: wallet.user_id,
        network: depositNetwork,
        coin_amount: coinAmount,
        wallet_address: address,
        mode: TransactionModeType.credit,
        entity_type: TransactionEntityType.deposit,
        metadata: data,
        exchange_rate_id: rate ? rate.id : null,
        currency,
        entity_id: wb.id,
        dollar_amount: dollarAmount,
        amount: nairaAmount,
        coin_exchange_rate: coinPrice,
        status: TransactionStatusType.success,
      } as unknown as Transactions);
    }

    const feeApplies = !DEPOSIT_FEE_EXEMPT_CURRENCIES.has(
      currency.toLowerCase(),
    );
    const feeUsd = feeApplies ? Math.min(DEPOSIT_FEE_USD, dollarAmount) : 0;

    if (feeUsd > 0) {
      await this.transactionsRepository.save({
        user_id: wallet.user_id,
        network: depositNetwork,
        coin_amount: coinPrice > 0 ? feeUsd / coinPrice : 0,
        wallet_address: address,
        mode: TransactionModeType.debit,
        entity_type: TransactionEntityType.deposit_fee,
        metadata: {
          deposit_id: depositId,
          note: "Deposit fee",
          fee_usd: feeUsd,
        },
        exchange_rate_id: rate ? rate.id : null,
        currency,
        entity_id: webhookEntityId,
        masamasa_ref: generateMasamasaRef(),
        dollar_amount: feeUsd,
        amount: feeUsd * exchange,
        coin_exchange_rate: coinPrice,
        status: TransactionStatusType.success,
      } as unknown as Transactions);
    }

    sendZohoMailWithTemplate(
      {
        to: {
          name: `${capitalizeString(wallet.user.first_name)}`,
          email: wallet.user.email,
        },
      },
      {
        subject: `${wallet.currency} Deposit Confirmed`,
        templateId: ZohoMailTemplates.coins_deposit_confirmed,
        variables: {
          firstName: capitalizeString(wallet.user.first_name),
          coin: `${currencyFormatter(coinAmount, "NGN", 2, false)} ${currency}`,
          network: depositNetwork,
          amount: `NGN ${currencyFormatter(nairaAmount, "NGN", 2, false)}`,
          address: address,
          subject: `${wallet.currency} Deposit Confirmed`,
        },
      },
    );

    this.notificationsService.create({
      userId: wallet.user_id,
      message: `Your deposit of ${currencyFormatter(coinAmount, "NGN", 2, false)} ${currency.toUpperCase()} has been confirmed`,
      tag: NotificationTag.deposit,
      pushTitle: "Deposit Successful",
      metadata: data,
    });

    // This deposit may be the one that takes the depositor past the referral
    // threshold. Awaited so the reward is in place before the webhook returns,
    // but the call swallows its own errors — referral bookkeeping must never
    // fail a deposit that has already been credited.
    await this.referralsService.evaluateQualification(wallet.user_id);

    // Move the deposited crypto from the user's Quidax sub-account into the master account.
    if (wallet.user.quidax_id) {
      this.quidaxService
        .sweepToMasterAccount(
          wallet.user.quidax_id,
          currency,
          amount,
          network ?? toQuidaxNetwork(depositNetwork),
        )
        .catch((err) => {
          this.logger.error(
            `Sweep to master failed for deposit ${depositId} (user ${wallet.user_id}, ${amount} ${currency}): ${err?.response?.data?.message ?? err?.message}`,
          );
        });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositOnHold(data: any): Promise<void> {
    const { depositId, currency, amount, address, network, destinationTag } =
      this.extractDepositFields(data);
    if (!depositId || !address) return;

    const wallet = await this.findDepositWallet(
      address,
      currency,
      destinationTag,
    );

    const existingWebhook = await this.webhookRepository.findOne({
      where: { hash: depositId },
    });

    if (existingWebhook) {
      // Downgrade processing → pending (confirmation fired but deposit is now on_hold)
      if (wallet) {
        await this.transactionsRepository
          .createQueryBuilder()
          .update(Transactions)
          .set({ status: TransactionStatusType.pending, metadata: data })
          .where("entity_id = :entityId", { entityId: existingWebhook.id })
          .andWhere("entity_type = :type", {
            type: TransactionEntityType.deposit,
          })
          .execute();
      }
    } else {
      // No prior confirmation — create webhook + pending transaction
      const wb = await this.webhookRepository.save({
        address,
        entity_type: WebhookEntityType.deposit,
        hash: depositId,
        metadata: data,
      });

      if (wallet) {
        await this.transactionsRepository.save({
          user_id: wallet.user_id,
          network: wallet.network ?? toAppNetwork(network, currency),
          coin_amount: parseFloat(amount) || 0,
          wallet_address: address,
          mode: TransactionModeType.credit,
          entity_type: TransactionEntityType.deposit,
          metadata: data,
          currency,
          entity_id: wb.id,
          dollar_amount: 0,
          amount: 0,
          coin_exchange_rate: 0,
          status: TransactionStatusType.pending,
        } as unknown as Transactions);
      }
    }

    if (wallet) {
      this.notificationsService.create({
        userId: wallet.user_id,
        message: `Your ${currency.toUpperCase()} deposit of ${amount} is on hold — amount is below the minimum deposit threshold`,
        tag: NotificationTag.deposit,
        pushTitle: "Deposit On Hold",
        metadata: data,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositFailed(data: any, event: string): Promise<void> {
    const { depositId, currency, amount, address, txid } =
      this.extractDepositFields(data);

    this.logger.warn(
      `Deposit ${event} — depositId: ${depositId}, txid: ${txid}, address: ${address}, currency: ${currency}, amount: ${amount}`,
    );

    // Update the processing transaction to failed if confirmation had already fired
    const existingWebhook = await this.webhookRepository.findOne({
      where: { hash: depositId },
    });
    if (existingWebhook) {
      await this.transactionsRepository
        .createQueryBuilder()
        .update(Transactions)
        .set({ status: TransactionStatusType.failed, metadata: data })
        .where("entity_id = :entityId", { entityId: existingWebhook.id })
        .andWhere("entity_type = :type", {
          type: TransactionEntityType.deposit,
        })
        .execute();
    }
  }

  async testMail() {
    console.log("kkkk");
    sendZohoMailWithTemplate(
      {
        to: {
          name: `Lekzy`,
          email: "ilelaboyealekan@gmail.com",
        },
      },
      {
        subject: "Verification Code",
        templateId: ZohoMailTemplates.verify_email,
        variables: {
          token: "1234",
        },
      },
    );
  }
}
