import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  CurrencyCoin,
  ExchangeRate,
  ExchangeRateStatus,
} from "./exchange-rates.entity";

@Injectable()
export class ExchangeRateService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>
  ) {}

  async findAll() {
    return await this.exchangeRateRepository
      .createQueryBuilder("exchange_rate")
      .orderBy("created_at", "DESC")
      .getMany();
  }

  async getActiveRate() {
    return await this.exchangeRateRepository
      .createQueryBuilder("exchange_rate")
      .where("exchange_rate.status = :status", {
        status: ExchangeRateStatus.active,
      })
      .getMany();
  }

  async getCurrencyActiveRate(currency) {
    return await this.exchangeRateRepository
      .createQueryBuilder("exchange_rate")
      .where("exchange_rate.status = :status", {
        status: ExchangeRateStatus.active,
      })
      .andWhere("exchange_rate.currency = :currency", { currency: currency })
      .getOne();
  }

  async saveNewRate(admin_id, currency, rate) {
    const update = await this.exchangeRateRepository.update(
      { currency: currency },
      { status: ExchangeRateStatus.disabled }
    );
    const create = await this.exchangeRateRepository.save({
      admin_id,
      currency,
      rate,
      status: ExchangeRateStatus.active,
    });

    return create;
  }
}
