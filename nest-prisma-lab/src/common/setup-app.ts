import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from './interceptors/http-logging.interceptor';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(),
    new ResponseEnvelopeInterceptor(app.get(Reflector)),
  );
}
