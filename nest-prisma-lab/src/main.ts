import 'dotenv/config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/setup-app';
import { enhanceOpenApi } from './common/swagger/openapi-enhancer';
import { validateEnv } from './config/env';
import { UPLOAD_ROOT } from './rooms/room-image.upload';

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ prefix: 'hotel-api' }),
  });

  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  configureApp(app);
  app.useStaticAssets(UPLOAD_ROOT, { prefix: '/uploads' });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hotel Booking System API')
    .setDescription(
      [
        'REST API for hotel rooms, bookings, search and notifications.',
        '',
        '## How to try it (authentication flow)',
        '1. Open **auth → POST /auth/login** and click *Try it out*.',
        '2. Log in with a seed account (below) and copy `data.access_token` from the response.',
        '3. Click **Authorize** (top right), paste the token (without the word "Bearer") and confirm.',
        '4. Locked endpoints now work. **POST /auth/logout** revokes the token immediately.',
        '',
        '| Role | Email | Password |',
        '|---|---|---|',
        '| ADMIN | `admin@example.com` | `Admin123!` |',
        '| USER | `user@example.com` | `User1234!` |',
        '',
        'Accounts created with `POST /auth/register` are always regular users.',
        '',
        '## Who can call what',
        '- **Guest** (no token): register, login, list/view/search rooms, health check.',
        '- **User**: profile, own bookings (create, list, view, cancel), own notifications.',
        '- **Admin**: everything a user can, plus room management (create, edit, delete,',
        '  enable/disable, image upload), all bookings and booking status changes.',
        '',
        'Missing/invalid token answers `401`, a wrong role answers `403`.',
        '',
        '## Response format',
        'Success: `{ "success": true, "message": "...", "data": ..., "meta": ... }` ',
        '(`meta` only on paginated lists). Error: `{ "success": false, "statusCode": 400, "message": "...", "errors": [...], "path": "...", "timestamp": "..." }`.',
        '',
        '## Rate limiting',
        '100 requests/minute per client by default; `/auth/login` and `/auth/register` allow',
        '5/minute and `POST /bookings` 10/minute. Exceeding a limit returns `429`.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addTag('auth', 'Sign up, login, logout')
    .addTag('users', 'Own profile')
    .addTag(
      'rooms',
      'Room listing, details, search, images and admin management',
    )
    .addTag('bookings', 'Booking management')
    .addTag('notifications', 'Booking event notifications')
    .addTag('health', 'Health check')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  SwaggerModule.setup(
    'api-docs',
    app,
    enhanceOpenApi(SwaggerModule.createDocument(app, swaggerConfig)),
    { swaggerOptions: { persistAuthorization: true } },
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
