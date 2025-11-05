import { appConfig } from "@/config";
import { MAILJETTemplates } from "@/constants";
import { capitalizeString } from "@/core/helpers";
import { sendMailJetWithTemplate } from "@/core/utils";
import { User } from "@/modules/users/entities/user.entity";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TransactionWebhookDto } from "./dto";
import { Wallet } from "@/modules/wallet/wallet.entity";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
} from "@/modules/transactions/transactions.entity";
import { Webhook, WebhookEntityType } from "./entities/webhook.entity";
import axios from "axios";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { NotificationTag } from "@/modules/notifications/entities/notification.entity";

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
    private readonly exchangeRateService: ExchangeRateService,
    private readonly notificationsService: NotificationsService
  ) {}

  async transactionWebhook(transactionWebhook: TransactionWebhookDto) {
    const { address, network, amount, token_symbol } = transactionWebhook;

    const wb = await this.webhookRepository.save({
      address,
      entity_type: WebhookEntityType.deposit,
      metadata: JSON.stringify(transactionWebhook),
    });

    const wallet = await this.walletRepository.findOne({
      where: { wallet_address: address },
    });
    if (!wallet) throw new BadRequestException("Wallet address not found");

    const rate = await this.exchangeRateService.getActiveRate();
    var exchange = 0;
    if (rate) {
      exchange = rate.rate;
    }
    var coin_price = 0;
    var price: { status: boolean; price: any } = await this.getPrice(
      `${token_symbol}USDT`
    );
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
    console.log("djdjf");
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
      const responses = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,tether,usd-coin,cardano,doge,ripple&vs_currencies=usd`
      );

      return responses;
    } catch (error) {
      console.log(error);
      throw new BadRequestException("Failed to fetch prices");
    }
  }
}
