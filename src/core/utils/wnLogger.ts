import * as winston from "winston";

export const wnLogger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: "public/logs/system.log",
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
});
