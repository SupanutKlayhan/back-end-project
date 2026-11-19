import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import { SUCCESS_MESSAGE_KEY } from '../decorators/success-message.decorator';

export interface SuccessEnvelope {
  success: true;
  message: string;
  data: unknown;
  meta?: unknown;
}

const DEFAULT_MESSAGES: Record<string, string> = {
  GET: 'Request successful',
  POST: 'Created successfully',
  PUT: 'Updated successfully',
  PATCH: 'Updated successfully',
  DELETE: 'Deleted successfully',
};

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/health') {
      return next.handle();
    }
    const message =
      this.reflector.get<string | undefined>(
        SUCCESS_MESSAGE_KEY,
        context.getHandler(),
      ) ??
      DEFAULT_MESSAGES[request.method] ??
      'Request successful';

    return next.handle().pipe(map((body) => wrap(body, message)));
  }
}

function isPage(body: unknown): body is { data: unknown; meta: unknown } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const keys = Object.keys(body);
  return keys.length === 2 && 'data' in body && 'meta' in body;
}

export function wrap(body: unknown, message: string): SuccessEnvelope {
  if (isPage(body)) {
    return { success: true, message, data: body.data, meta: body.meta };
  }
  return { success: true, message, data: body ?? null };
}
