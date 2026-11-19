import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { users } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

export type PublicUser = Omit<users, 'password'>;

export function toPublicUser(user: users): PublicUser {
  const { password: _password, ...rest } = user;
  return rest;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, email: string, password: string) {
    this.logger.log('Registering a new user');
    const existing = await this.prisma.users.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await this.prisma.users.create({
      data: { name, email, password: hashed, role: 'USER' },
    });
    this.logger.log(`User created id=${user.id}`);
    return toPublicUser(user);
  }

  findByEmail(email: string) {
    return this.prisma.users.findUnique({ where: { email } });
  }

  async getProfile(userId: number): Promise<PublicUser> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: { name?: string; email?: string; password?: string } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.email !== undefined && dto.email !== user.email) {
      const taken = await this.prisma.users.findUnique({
        where: { email: dto.email },
      });
      if (taken) {
        throw new ConflictException('Email is already registered');
      }
      data.email = dto.email;
    }
    if (dto.password !== undefined) {
      if (!dto.current_password) {
        throw new BadRequestException(
          'current_password is required to change the password',
        );
      }
      if (!(await bcrypt.compare(dto.current_password, user.password))) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      data.password = await bcrypt.hash(dto.password, 12);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data,
    });
    this.logger.log(`Profile updated id=${userId}`);
    return toPublicUser(updated);
  }
}
