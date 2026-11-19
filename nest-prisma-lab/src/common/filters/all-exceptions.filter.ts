import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface NormalizedError {
  statusCode: number;
  message: string;
  errors?: string[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { statusCode, message, errors } = this.normalize(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${statusCode} ${message}`,
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(errors && { errors }),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return { statusCode, message: body };
      }
      const raw = (body as { message?: string | string[] }).message;
      if (Array.isArray(raw)) {
        return { statusCode, message: 'Validation failed', errors: raw };
      }
      return { statusCode, message: raw ?? exception.message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'A record with the same unique value already exists',
          };
        case 'P2003':
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'The operation conflicts with a related record',
          };
        case 'P2025':
          return {
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Record not found',
          };
        default:
          if (exception.code.startsWith('P1')) {
            return this.databaseDown();
          }
      }
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return this.databaseDown();
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private databaseDown(): NormalizedError {
    return {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Database is temporarily unavailable, please try again later',
    };
  }
}
