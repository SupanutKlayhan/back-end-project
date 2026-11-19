import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createKeyv } from '@keyv/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RoomsModule } from './rooms/rooms.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          throw new Error('REDIS_URL is missing');
        }
        return {
          stores: [createKeyv(redisUrl)],
          ttl: 5 * 60 * 1000, // milliseconds
        };
      },
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
        skipIf: () => process.env.DISABLE_THROTTLE === 'true',
      },
    ]),

    PrismaModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    BookingsModule,
    NotificationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
