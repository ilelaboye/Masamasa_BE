import { Injectable } from "@nestjs/common";
import { CronJob } from "./cron.job";

@Injectable()
export class CronService {
  constructor(private readonly cronJob: CronJob) {}
}
