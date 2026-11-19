import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Cache } from 'cache-manager';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type Part = 'up' | 'down';

const CHECK_TIMEOUT_MS = 2_000;

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Checks the database and Redis. Returns 503 if either is down.',
  })
  @ApiResponse({
    status: 200,
    description: 'Everything is up',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        db: { type: 'string', example: 'up' },
        redis: { type: 'string', example: 'up' },
        uptime_seconds: { type: 'integer', example: 120 },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Database or Redis is down' })
  async check(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const ok = db === 'up' && redis === 'up';
    if (!ok) {
      res.status(503);
    }
    return {
      status: ok ? 'ok' : 'error',
      db,
      redis,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<Part> {
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<Part> {
    try {
      const value = String(Date.now());
      await this.withTimeout(this.cache.set('health:ping', value, 5_000));
      const stored = await this.withTimeout(
        this.cache.get<string>('health:ping'),
      );
      return stored === value ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS),
      ),
    ]);
  }
}
