import { Injectable } from "@nestjs/common";
import { CronJob } from "./cron.job";
import { Cron, Interval } from "@nestjs/schedule";
import { _IS_PROD_ } from "@/constants";

@Injectable()
export class CronService {
  constructor(private readonly cronJob: CronJob) {}

  // @Interval(50000)
  // @Interval(10000)
  // async processPayment() {
  //   this.cronJob.processPaymentJob();
  // }

  // Every 5 minutes
  @Interval(300000)
  async verifyTransactions() {
    if (!_IS_PROD_) return;
    this.cronJob.verifyTransactionJob();
  }

  @Interval(120000)
  async verifyProcessingVtpassTransactions() {
    if (!_IS_PROD_) return;
    this.cronJob.verifyProcessingVtpassTransactions();
  }

  @Cron("*/20 * * * *")
  async generateNombaAccessToken() {
    if (!_IS_PROD_) return;
    await this.cronJob.generateNombaAccessToken();
  }

  // Hourly — checks Nomba & VTPass balances and emails an alert
  // when either drops below its threshold.
  @Interval(3600000)
  async monitorProviderBalances() {
    if (!_IS_PROD_) return;
    await this.cronJob.monitorProviderBalances();
  }
}
