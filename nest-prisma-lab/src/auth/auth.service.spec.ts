import { Logger, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuthService, DENYLIST_PREFIX } from './auth.service';

describe('AuthService (unit)', () => {
  let service: AuthService;
  const usersMock = { findByEmail: jest.fn() };
  const jwtMock = { signAsync: jest.fn() };
  const cacheMock = { set: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: CACHE_MANAGER, useValue: cacheMock },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns a token for the right password and puts role/email in the payload', async () => {
    usersMock.findByEmail.mockResolvedValue({
      id: 3,
      email: 'a@b.c',
      role: 'ADMIN',
      password: await bcrypt.hash('Secret123!', 4),
    });
    jwtMock.signAsync.mockResolvedValue('signed.jwt');

    const result = await service.login({
      email: 'a@b.c',
      password: 'Secret123!',
    });

    expect(result).toEqual({ access_token: 'signed.jwt' });
    const [payload, options] = jwtMock.signAsync.mock.calls[0];
    expect(payload).toEqual({ sub: 3, email: 'a@b.c', role: 'ADMIN' });
    expect(options.jwtid).toEqual(expect.any(String));
  });

  it('rejects a wrong password with the same message as an unknown e-mail', async () => {
    usersMock.findByEmail.mockResolvedValue({
      id: 3,
      email: 'a@b.c',
      role: 'USER',
      password: await bcrypt.hash('Secret123!', 4),
    });
    await expect(
      service.login({ email: 'a@b.c', password: 'wrong' }),
    ).rejects.toThrow('Invalid email or password');

    usersMock.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@y.z', password: 'whatever' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('logout stores the token id in the deny list until the token expires', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    await service.logout({ userId: 3, role: 'USER', jti: 'abc', exp } as never);
    const [key, value, ttl] = cacheMock.set.mock.calls[0];
    expect(key).toBe(`${DENYLIST_PREFIX}abc`);
    expect(value).toBe(true);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600_000);
  });

  it('logout does nothing for an already expired token', async () => {
    await service.logout({
      userId: 3,
      role: 'USER',
      jti: 'abc',
      exp: 1,
    } as never);
    expect(cacheMock.set).not.toHaveBeenCalled();
  });
});
