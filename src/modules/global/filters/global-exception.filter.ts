import { appConfig } from "@/config";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { WinstonLogger } from "../logger/winston-logger";

@Catch(HttpException)
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly winstonLogger = new WinstonLogger();

  constructor(private httpAdapterHost: HttpAdapterHost) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost,
      ctx = host.switchToHttp(),
      httpStatus = exception.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR,
      errorEnvironment = ["dev", "staging"];

    //log error
    this.logger.error(`Exception: ${exception.message}\nStatus: ${httpStatus}`);
    this.winstonLogger.error(
      `Exception: ${exception}\nStatus: ${httpStatus}\nERROR: ${exception}`,
    );

    const msg = exception.message || "Bad request",
      statusCode = msg.includes("typeorm")
        ? HttpStatus.INTERNAL_SERVER_ERROR
        : httpStatus;

    //reply
    httpAdapter.reply(
      ctx.getResponse(),
      {
        success: false,
        message: msg.includes("typeorm")
          ? "An internal server error occurred"
          : msg,
        errors: Array.isArray(exception.cause) ? exception.cause : undefined,
        stackTrace:
          errorEnvironment.includes(appConfig.ENV) && appConfig.DEBUG === "true"
            ? exception
            : undefined,
      },
      statusCode,
    );
  }
}
