import { Logger } from '@nestjs/common';

/* eslint-disable @typescript-eslint/no-explicit-any */
type RetryFunction<T, Args extends any[]> = (...args: Args) => Promise<T>;

export async function withRetry<T, Args extends any[]>(
  fn: RetryFunction<T, Args>,
  maxRetries: number,
  initialWaitTime: number,
  ...args: Args
): Promise<T | undefined> {
  let retries = 0;
  let waitTime = initialWaitTime;

  while (retries < maxRetries) {
    try {
      return await fn(...args);
    } catch (error) {
      retries++;
      Logger.error(`Error occurred on attempt ${retries}: ${error}`);

      const waitTimeWithJitter = waitTime + Math.floor(Math.random() * waitTime * 0.2);

      Logger.log(`Waiting for ${waitTimeWithJitter}ms before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, waitTimeWithJitter));

      waitTime *= 2;
    }
  }

  Logger.error(`Request failed after ${maxRetries} attempts. Error`, fn.name);
}
