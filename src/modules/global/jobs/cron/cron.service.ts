import { Injectable } from "@nestjs/common";
import { CronJob } from "./cron.job";
import { Interval } from "@nestjs/schedule";

@Injectable()
export class CronService {
  constructor(private readonly cronJob: CronJob) {}

  @Interval(50000)
  async processPayment() {
    this.cronJob.processPaymentJob();
  }

  // @Interval(60000)
  // async verifyTransactions() {
  //   this.cronJob.verifyTransactionJob();
  // }
}
