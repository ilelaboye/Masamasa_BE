/* eslint-disable @typescript-eslint/no-explicit-any */
import { appConfig } from '@/config';
import { HttpException, HttpStatus } from '@nestjs/common';

export interface ResponseDTO {
  success: boolean;
  data: object | null;
  message?: string;
  errors?: object | null;
}

export const successResponse = (res: any, response: any): ResponseDTO => {
  const { message, data } = response;
  const status = response instanceof HttpException ? HttpStatus.BAD_REQUEST : HttpStatus.OK;
  return res.status(status).json({ success: status === HttpStatus.OK, message, data });
};

export const errorResponse = (res: any, error: any): ResponseDTO => {
  const errorEnvironment = ['dev', 'staging'];
  const msg = typeof error.message === 'string' ? error.message : 'Bad request.',
    statusCode = msg.includes('typeorm') ? HttpStatus.INTERNAL_SERVER_ERROR : error.status;

  return res.status(statusCode ?? HttpStatus.BAD_REQUEST).json({
    success: false,
    message: msg.includes('typeorm') ? 'An internal server error occurred' : msg,
    errors: Array.isArray(error.cause) ? error.cause : undefined,
    stackTrace: errorEnvironment.includes(appConfig.ENV) && appConfig.DEBUG === 'true' ? error : undefined,
  });
};
