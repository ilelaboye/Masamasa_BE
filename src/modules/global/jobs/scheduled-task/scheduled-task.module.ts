import { Module } from '@nestjs/common';
import { ScheduledTaskService } from './scheduled-task.service';

@Module({
  providers: [ScheduledTaskService],
})
export class ScheduledTaskModule {}
