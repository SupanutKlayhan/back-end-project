import {
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService (unit)', () => {
  let service: UsersService;
  const prismaMock = {
    users: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('registers a USER, hashes the password and never returns it (NFR-1, NFR-4)', async () => {
    prismaMock.users.findUnique.mockResolvedValue(null);
    prismaMock.users.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 1, ...data }),
    );

    const result = await service.create('Ann', 'ann@x.com', 'Password1!');

    const saved = prismaMock.users.create.mock.calls[0][0].data;
    expect(saved.role).toBe('USER');
    expect(saved.password).not.toBe('Password1!');
    expect(await bcrypt.compare('Password1!', saved.password)).toBe(true);
    expect(result).not.toHaveProperty('password');
  });

  it('answers 409 for an e-mail that is already registered', async () => {
    prismaMock.users.findUnique.mockResolvedValue({ id: 2 });
    await expect(
      service.create('Ann', 'ann@x.com', 'Password1!'),
    ).rejects.toThrow(ConflictException);
  });

  describe('updateProfile', () => {
    const stored = async () => ({
      id: 1,
      name: 'Ann',
      email: 'ann@x.com',
      role: 'USER',
      password: await bcrypt.hash('Old12345!', 4),
    });

    it('needs the current password to set a new one', async () => {
      prismaMock.users.findUnique.mockResolvedValue(await stored());
      await expect(
        service.updateProfile(1, { password: 'New12345!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a wrong current password', async () => {
      prismaMock.users.findUnique.mockResolvedValue(await stored());
      await expect(
        service.updateProfile(1, {
          password: 'New12345!',
          current_password: 'nope',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates the name and returns no password', async () => {
      prismaMock.users.findUnique.mockResolvedValue(await stored());
      prismaMock.users.update.mockResolvedValue({
        ...(await stored()),
        name: 'Anna',
      });
      const result = await service.updateProfile(1, { name: 'Anna' });
      expect(result.name).toBe('Anna');
      expect(result).not.toHaveProperty('password');
    });

    it('refuses an empty update', async () => {
      prismaMock.users.findUnique.mockResolvedValue(await stored());
      await expect(service.updateProfile(1, {})).rejects.toThrow(
        'Nothing to update',
      );
    });
  });
});
