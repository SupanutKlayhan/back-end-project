import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { userId?: number } }>();
    const response = http.getResponse<Response>();
    if (request.path === '/health') {
      return next.handle();
    }
    const started = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${request.method} ${request.path} ${response.statusCode} ` +
            `${Date.now() - started}ms user=${request.user?.userId ?? '-'}`,
        );
      }),
    );
  }
}
