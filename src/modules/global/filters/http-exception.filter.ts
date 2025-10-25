import { appConfig } from '@/config';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>(),
      status = exception.getStatus();

    this.logger.error(`Exception: ${exception.message}\nStatus: ${status}`);

    response.status(status).json({
      timestamp: new Date().toISOString(),
      status,
      message: exception.message,
      errors: exception.cause,
      stacktrace: appConfig.ENV === 'dev' ? exception.stack : undefined,
    });
  }
}
