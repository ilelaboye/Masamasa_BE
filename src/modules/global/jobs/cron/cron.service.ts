import { Injectable } from "@nestjs/common";
import { CronJob } from "./cron.job";
import { Cron, Interval } from "@nestjs/schedule";

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
    this.cronJob.verifyTransactionJob();
  }

  @Interval(120000)
  async verifyProcessingVtpassTransactions() {
    this.cronJob.verifyProcessingVtpassTransactions();
  }

  @Cron("*/20 * * * *")
  async generateNombaAccessToken() {
    await this.cronJob.generateNombaAccessToken();
  }

  // Every 30 minutes — checks Nomba & VTPass balances and emails an alert
  // when either drops below its threshold.
  // @Interval(300000)
  @Interval(1800000)
  async monitorProviderBalances() {
    await this.cronJob.monitorProviderBalances();
  }
}
