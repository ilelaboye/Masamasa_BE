import { appConfig } from "@/config";
import { MAILJETTemplates, ZohoMailTemplates } from "@/constants";
import {
  axiosClient,
  getBanks,
  sendMailJetWithTemplate,
  sendZohoMailWithTemplate,
} from "@/core/utils";
import { User } from "@/modules/users/entities/user.entity";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BankAccountVerificationDto, TransactionWebhookDto } from "./dto";
import { Status, Wallet } from "@/modules/wallet/wallet.entity";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { Webhook, WebhookEntityType } from "./entities/webhook.entity";
import axios from "axios";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { NotificationTag } from "@/modules/notifications/entities/notification.entity";
import { CreateWalletDto } from "@/modules/wallet/wallet.dto";
import {
  AccessToken,
  AccessTokenType,
} from "../bank-verification/entities/access-token.entity";
import { CronJob } from "../jobs/cron/cron.job";
import { toAppNetwork } from "@/modules/quidax/quidax.constants";

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
  ) {}

  async transactionWebhook(transactionWebhook: TransactionWebhookDto) {
    const { address, network, amount, token_symbol, hash } = transactionWebhook;

    const find = await this.webhookRepository.findOne({
      where: { hash: hash },
    });
    if (find) {
      throw new BadRequestException("Webhook already processed");
    }

    const wb = await this.webhookRepository.save({
      address,
      entity_type: WebhookEntityType.deposit,
      metadata: JSON.stringify(transactionWebhook),
      hash: hash,
    });

    const wallet = await this.walletRepository.findOne({
      where: { wallet_address: address },
    });
    if (!wallet) throw new BadRequestException("Wallet address not found");

    const rate = await this.exchangeRateService.getCurrencyActiveRate(
      token_symbol.toLowerCase(),
    );
    let exchange = 0;
    console.log("rate", rate);
    if (rate) {
      exchange = rate.rate;
    }
    console.log("exchange", exchange);
    let coin_price = 0;
    const price: { status: boolean; price: any } = await this.getPrice(
      `${token_symbol}`,
    );
    console.log("price", price);
    if (price.status) {
      coin_price = price.price;
    }

    const trans = await this.transactionsRepository.save({
      user_id: wallet.user_id,
      network: network,
      coin_amount: amount,
      wallet_address: wallet,
      mode: TransactionModeType.credit,
      entity_type: TransactionEntityType.deposit,
      metadata: transactionWebhook,
      exchange_rate_id: rate ? rate.id : null,
      currency: token_symbol,
      entity_id: wb.id,
      dollar_amount: coin_price * amount,
      amount: coin_price * amount * exchange,
      coin_exchange_rate: coin_price,
    } as unknown as Transactions);

    this.notificationsService.create({
      userId: wallet.user_id,
      message: `Your deposit of ${amount} ${token_symbol} is confirmed`,
      tag: NotificationTag.deposit,
      metadata: transactionWebhook,
    });

    return trans;
  }

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
          this.transactionsRepository.update(
            { id: transaction.id },
            {
              status: TransactionStatusType.success,
              metadata: { ...transaction.metadata, nomba_resp: webhook.data },
            },
          );
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
    try {
      const coin = await axios.get(
        `https://api.coingecko.com/api/v3/search?query=${symbol}`,
      );
      console.log("coin", coin.data);
      // return coin;
      const api_symbol = coin.data.coins[0].api_symbol;
      const responses = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${api_symbol}&vs_currencies=usd`,
      );
      return { status: true, price: responses.data[api_symbol].usd };
    } catch (error) {
      console.log(error);
      return { status: false, price: null };
    }
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

    try {
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/coins/markets",
        {
          params: {
            vs_currency: "usd",
            ids: "bitcoin,ethereum,binancecoin,solana,tether,usd-coin,cardano,dogecoin,ripple,polygon-ecosystem-token",
            order: "market_cap_desc",
            per_page: 100,
            page: 1,
            price_change_percentage: "24h",
          },
        },
      );

      // Transform response into your desired format
      const data = {};
      response.data.forEach((coin) => {
        let id = coin.id;
        if (coin.id === "dogecoin") id = "doge";
        if (coin.id === "polygon-ecosystem-token") id = "pol";
        data[id] = {
          usd: coin.current_price,
          change_24h: coin.price_change_percentage_24h,
          direction: coin.price_change_percentage_24h >= 0 ? "up" : "down",
        };
      });

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.log(error);
      throw new BadRequestException("Failed to fetch prices");
    }
  }

  async getBanksFromNomba() {
    console.log("getBanksFromNomba called");
    const accessToken = await this.accessTokenRepository.findOne({
      where: { type: AccessTokenType.nomba },
    });
    console.log("accessToken", accessToken);
    if (!accessToken) {
      console.log("No access token found, generating new one");
      const get = await this.cronJob.generateNombaAccessToken();
      console.log("Generated access token", get);
    }
    try {
      if (accessToken) {
        const resp = await axiosClient(
          `${appConfig.NOMBA_BASE_URL}/v1/transfers/banks`,
          {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              accountId: appConfig.NOMBA_ACCOUNT_ID,
            },
          },
        );

        console.log("nomba banks", resp);
        return resp.data;
      }
    } catch (error) {
      throw new BadRequestException(error.response.data.description);
    }
  }

  async getBanks() {
    // return getBanks();
    return await this.getBanksFromNomba();
  }

  // async saveWalletAddress(createWalletDto: CreateWalletDto) {
  //   console.log(
  //     "called saveWalletAddress",
  //     createWalletDto.user_id,
  //     createWalletDto.network,
  //     createWalletDto.wallet_address
  //   );
  //   const existing = await this.walletRepository.exists({
  //     where: { wallet_address: createWalletDto.wallet_address },
  //   });
  //   if (existing) {
  //     throw new BadRequestException("Wallet address already exist");
  //   }

  //   const user = await this.userRepository.exists({
  //     where: { id: createWalletDto.user_id },
  //   });
  //   if (!user) {
  //     throw new BadRequestException("User not found");
  //   }
  //   const user_wall = await this.walletRepository.exists({
  //     where: { user_id: createWalletDto.user_id },
  //   });
  //   if (user_wall) {
  //     throw new BadRequestException(
  //       "Wallet has already been created for this user"
  //     );
  //   }
  //   const wallet = this.walletRepository.create({
  //     user: { id: createWalletDto.user_id },
  //     network: createWalletDto.network,
  //     currency: createWalletDto.currency,
  //     wallet_address: createWalletDto.wallet_address,
  //   });
  //   console.log("done", wallet);
  //   return await this.walletRepository.save(wallet);
  // }

  async verifyAccountNumberFromNomba(accountNumber, bankCode, bankName) {
    var accessToken = await this.accessTokenRepository.findOne({
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
    } catch (e) {
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
    } catch (error) {
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

  async test() {
    try {
      const res = await axios.get(
        `https://openapi.quidax.io/exchange-open-api/api/v1/users/ujhoruuq/wallets/usdt/address`,

        {
          headers: {
            Authorization: `Bearer ZSKTsErViB1iY2nfVgzS6nv26kJLAjqL`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        },
      );
      console.log("quidax test", res);
      return res;
    } catch (error) {
      console.log("quidax test error", error.response?.data);
      console.log("quidax test error", error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleQuidaxWebhook(payload: any): Promise<void> {
    const { event, data } = payload ?? {};
    if (!event || !data) return;

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
    const { currency, address, network, user: quidaxUser } = data;
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
      // Record already exists (created by API response during registration/backfill).
      // Idempotent: only update if the address slot is still empty.
      console.log(
        `[QuidaxWebhook] wallet already exists for user ${user.id} (${currency}/${appNetwork})`,
      );
      if (!existingWallet.wallet_address) {
        await this.walletRepository.update(
          { id: existingWallet.id },
          { wallet_address: address },
        );
      }
    } else {
      await this.walletRepository.save({
        user_id: user.id,
        network: appNetwork,
        currency,
        wallet_address: address,
        status: Status.active,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleWalletUpdated(data: any): void {
    // wallet.updated fires on any balance change (deposit received, transfer sent).
    // We do not write transaction records here — deposit.* events own that.
    this.logger.log(
      `wallet.updated — user: ${data?.user?.id}, currency: ${data?.currency}, balance: ${data?.balance}`,
    );
  }

  // Extracts the consistent fields from all deposit event payloads.
  // Idempotency key is data.id (Quidax deposit record ID — same value across
  // deposit.transaction.confirmation, deposit.successful, deposit.on_hold, etc.
  // for the same physical deposit).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractDepositFields(data: any) {
    return {
      depositId: data.id as string, // idempotency key
      txid: data.txid as string, // blockchain hash (metadata only)
      currency: data.currency as string,
      amount: data.amount as string,
      address: data.payment_address?.address as string, // the user's deposit address
      network: data.payment_address?.network as string,
    };
  }

  // Incoming TX detected on-chain — not yet confirmed.
  // Creates a processing transaction so the user sees the pending deposit immediately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositTransactionConfirmation(data: any): Promise<void> {
    const { depositId, currency, amount, address, network } =
      this.extractDepositFields(data);
    if (!depositId || !address) return;

    // Idempotency — skip if deposit.successful already beat us to it
    const existingWebhook = await this.webhookRepository.findOne({
      where: { hash: depositId },
    });
    if (existingWebhook) return;

    const wallet = await this.walletRepository.findOne({
      where: { wallet_address: address },
    });
    if (!wallet) return;

    const wb = await this.webhookRepository.save({
      address,
      entity_type: WebhookEntityType.deposit,
      hash: depositId,
      metadata: data,
    });

    await this.transactionsRepository.save({
      user_id: wallet.user_id,
      network,
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
      message: `Incoming ${currency.toUpperCase()} deposit of ${amount} detected — awaiting blockchain confirmation`,
      tag: NotificationTag.deposit,
      metadata: data,
    });
  }

  // Blockchain has confirmed the deposit.
  // If deposit.transaction.confirmation already ran → upgrade the processing
  // transaction to success with real amounts.
  // If not (confirmation missed) → create a fresh success transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositSuccessful(data: any): Promise<void> {
    const { depositId, currency, amount, address, network } =
      this.extractDepositFields(data);
    if (!depositId || !address) return;

    const wallet = await this.walletRepository.findOne({
      where: { wallet_address: address },
    });
    if (!wallet) return;

    const rate = await this.exchangeRateService.getCurrencyActiveRate(
      currency.toLowerCase(),
    );
    const exchange = rate?.rate ?? 0;
    const priceResult = await this.getPrice(currency);
    const coinPrice = priceResult.status ? (priceResult.price ?? 0) : 0;
    const coinAmount = parseFloat(amount) || 0;
    const dollarAmount = coinPrice * coinAmount;

    const existingWebhook = await this.webhookRepository.findOne({
      where: { hash: depositId },
    });

    if (existingWebhook) {
      // Upgrade the processing record created by deposit.transaction.confirmation
      await this.transactionsRepository
        .createQueryBuilder()
        .update(Transactions)
        .set({
          status: TransactionStatusType.success,
          dollar_amount: dollarAmount,
          amount: dollarAmount * exchange,
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

      await this.transactionsRepository.save({
        user_id: wallet.user_id,
        network,
        coin_amount: coinAmount,
        wallet_address: address,
        mode: TransactionModeType.credit,
        entity_type: TransactionEntityType.deposit,
        metadata: data,
        exchange_rate_id: rate ? rate.id : null,
        currency,
        entity_id: wb.id,
        dollar_amount: dollarAmount,
        amount: dollarAmount * exchange,
        coin_exchange_rate: coinPrice,
        status: TransactionStatusType.success,
      } as unknown as Transactions);
    }

    this.notificationsService.create({
      userId: wallet.user_id,
      message: `Your deposit of ${amount} ${currency.toUpperCase()} has been confirmed`,
      tag: NotificationTag.deposit,
      metadata: data,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositOnHold(data: any): Promise<void> {
    const { depositId, currency, amount, address, network } =
      this.extractDepositFields(data);
    if (!depositId || !address) return;

    const wallet = await this.walletRepository.findOne({
      where: { wallet_address: address },
    });

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
          network,
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
