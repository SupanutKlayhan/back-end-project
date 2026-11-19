import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import { UsersService } from '../users/users.service';
import type { AuthUser } from './auth-user';
import { LoginDto } from './dto/login.dto';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export const DENYLIST_PREFIX = 'denylist:';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    const matches = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_HASH,
    );
    if (!user || !matches) {
      this.logger.warn(`Login failed for ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const payload = { sub: user.id, email: user.email, role: user.role };
    this.logger.log(`User id=${user.id} logged in`);
    return {
      access_token: await this.jwtService.signAsync(payload, {
        jwtid: randomUUID(),
      }),
    };
  }

  async logout(user: AuthUser): Promise<void> {
    if (!user.jti || !user.exp) {
      return;
    }
    const ttlMs = user.exp * 1000 - Date.now();
    if (ttlMs > 0) {
      await this.cache.set(`${DENYLIST_PREFIX}${user.jti}`, true, ttlMs);
    }
    this.logger.log(`User id=${user.userId} logged out`);
  }
}
