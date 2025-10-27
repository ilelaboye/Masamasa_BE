import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { ExchangeRate } from "./exchange-rates.entity";

@Injectable()
export class ExchangeRateService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>
  ) {}

  async findAll() {
    return await this.exchangeRateRepository
      .createQueryBuilder("exchange_rate")
      .getMany();
  }
}
