import { appConfig } from "@/config";
import { MAILJETTemplates, ZohoMailTemplates } from "@/constants";
import { capitalizeString } from "@/core/helpers";
import {
  axiosClient,
  getBanks,
  sendMailJetWithTemplate,
  sendZohoMailWithTemplate,
} from "@/core/utils";
import { User } from "@/modules/users/entities/user.entity";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BankAccountVerificationDto, TransactionWebhookDto } from "./dto";
import { Wallet } from "@/modules/wallet/wallet.entity";
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

@Injectable()
export class PublicService {
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
    private readonly cronJob: CronJob
  ) {}

  async transactionWebhook(transactionWebhook: TransactionWebhookDto) {
    const { address, network, amount, token_symbol, hash } = transactionWebhook;

    const find = await this.webhookRepository.findOne({
      where: { hash: hash },
    });
    console.log("find webhook", find);
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
      token_symbol.toLowerCase()
    );
    let exchange = 0;
    console.log("rate", rate);
    if (rate) {
      exchange = rate.rate;
    }
    console.log("exchange", exchange);
    let coin_price = 0;
    const price: { status: boolean; price: any } = await this.getPrice(
      `${token_symbol}`
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
            { status: TransactionStatusType.failed }
          );
        }
      }
    }
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
        `https://api.coingecko.com/api/v3/search?query=${symbol}`
      );
      console.log("coin", coin.data);
      // return coin;
      const api_symbol = coin.data.coins[0].api_symbol;
      const responses = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${api_symbol}&vs_currencies=usd`
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
            ids: "bitcoin,ethereum,binancecoin,solana,tether,usd-coin,cardano,doge,ripple",
            order: "market_cap_desc",
            per_page: 100,
            page: 1,
            price_change_percentage: "24h",
          },
        }
      );

      // Transform response into your desired format
      const data = {};
      response.data.forEach((coin) => {
        data[coin.id] = {
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
          }
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
        }
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
        }
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
    bankAccountVerificationDto: BankAccountVerificationDto
  ) {
    const { accountNumber, bankCode, bankName } = bankAccountVerificationDto;
    return this.verifyAccountNumberFromNomba(accountNumber, bankCode, bankName);
    // return this.verifyAccountNumberFromClan(accountNumber, bankCode, bankName);
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
      }
    );
  }
}
