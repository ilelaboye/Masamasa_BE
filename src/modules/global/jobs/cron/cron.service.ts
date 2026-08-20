import { Injectable } from "@nestjs/common";
import { CronJob } from "./cron.job";
import { Cron, Interval } from "@nestjs/schedule";
import { _IS_PROD_ } from "@/constants";
import { ReferralsService } from "@/modules/referrals/referrals.service";

@Injectable()
export class CronService {
  constructor(
    private readonly cronJob: CronJob,
    private readonly referralsService: ReferralsService,
  ) {}

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

  // Safety net for referral rewards. The deposit webhooks award them in the
  // moment; this catches any deposit that reached `success` without passing
  // through those paths. Nightly, since a few hours' delay on a reward is
  // acceptable and the sweep scans every referred account.
  @Cron("15 2 * * *")
  async awardMissedReferralRewards() {
    if (!_IS_PROD_) return;
    await this.referralsService.awardMissedQualifications();
  }
}
