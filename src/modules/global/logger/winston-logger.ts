/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, LoggerService, Scope } from "@nestjs/common";
import { join } from "path";
import * as winston from "winston";

@Injectable({ scope: Scope.TRANSIENT })
export class WinstonLogger implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      transports: [
        new winston.transports.File({
          filename: join(process.cwd(), "/public/logs/error.log"),
          level: "error",
        }),
        new winston.transports.File({
          filename: join(process.cwd(), "/public/logs/combined.log"),
        }),
      ],
    });
  }

  log(message: string) {
    this.logger.info(message);
  }

  error(message: string, trace?: string) {
    this.logger.error(`${message}\n${trace}`);
  }

  warn(message: string) {
    // Implement according to your needs
  }

  debug(message: string) {
    // Implement according to your needs
  }

  verbose(message: string) {
    // Implement according to your needs
  }
}
