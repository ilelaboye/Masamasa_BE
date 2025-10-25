import { HttpException, HttpStatus } from '@nestjs/common';

export const httpErrorResponse = (message = 'bad request, try again', status = HttpStatus.BAD_REQUEST) => {
  return new HttpException(message, status);
};
