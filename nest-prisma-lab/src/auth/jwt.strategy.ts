import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Cache } from 'cache-manager';
import 'dotenv/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser, JwtPayload } from './auth-user';
import { DENYLIST_PREFIX } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger('JwtStrategy');

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is missing from the environment');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.jti && (await this.isRevoked(payload.jti))) {
      throw new UnauthorizedException('Token has been revoked');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp,
    };
  }

  private async isRevoked(jti: string): Promise<boolean> {
    try {
      return Boolean(await this.cache.get(`${DENYLIST_PREFIX}${jti}`));
    } catch (error) {
      this.logger.warn(
        `Could not check token denylist: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
