import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ResponseDTO<T> {
  success: boolean;
  message: string;
  data: T | null;
}

@Injectable()
export class GlobalHTTPInterceptor<T> implements NestInterceptor<T, ResponseDTO<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseDTO<T>> {
    // TODO: Use later to get status code
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((response) => {
        let data = response;
        let message = response?.message || undefined;

        // Handle special cases where data might be nested
        if (typeof response === 'object' && response !== null) {
          if ('data' in response) {
            data = response.data;
          }
          if ('message' in response && Object.keys(response).length < 2) {
            message = response.message;
            data = undefined;
          }
        }

        return {
          success: true,
          message,
          data,
        };
      }),
    );
  }

  private isSuccessStatusCode(statusCode: number): boolean {
    return statusCode >= 200 && statusCode < 300;
  }
}
