import { Injectable } from "@nestjs/common";
import { CronJob } from "./cron.job";
import { Cron, Interval } from "@nestjs/schedule";

@Injectable()
export class CronService {
  constructor(private readonly cronJob: CronJob) {}

  @Interval(50000)
  async processPayment() {
    this.cronJob.processPaymentJob();
  }

  @Interval(6000)
  async verifyTransactions() {
    this.cronJob.verifyTransactionJob();
  }

  @Interval(6000)
  async verifyProcessingVtpassTransactions() {
    this.cronJob.verifyProcessingVtpassTransactions();
  }

  @Cron("*/20 * * * *")
  async generateNombaAccessToken() {
    await this.cronJob.generateNombaAccessToken();
  }
}
