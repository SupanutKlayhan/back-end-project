import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';
import { paginated } from '../common/dto/pagination-query.dto';
import { parseStayRange } from '../common/utils/stay-range';
import { SearchRoomsQueryDto } from './dto/search-rooms-query.dto';

export interface FindRoomsOptions {
  isActive?: boolean;
  minCapacity?: number;
  page: number;
  limit: number;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger('RoomsService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private static readonly VERSION_KEY = 'rooms:version';
  private static readonly TTL_MS = 5 * 60 * 1000;

  private async cached<T>(suffix: string, load: () => Promise<T>): Promise<T> {
    if (process.env.DISABLE_CACHE === 'true') {
      return load();
    }
    let key: string;
    try {
      const version =
        (await this.cache.get<string>(RoomsService.VERSION_KEY)) ?? '0';
      key = `rooms:${version}:${suffix}`;
      const hit = await this.cache.get<T>(key);
      if (hit !== undefined && hit !== null) {
        return hit;
      }
    } catch (error) {
      this.logger.warn(
        `Cache unavailable, reading the database: ${String(error)}`,
      );
      return load();
    }
    const value = await load();
    try {
      await this.cache.set(key, value, RoomsService.TTL_MS);
    } catch (error) {
      this.logger.warn(`Could not write to the cache: ${String(error)}`);
    }
    return value;
  }

  private async invalidateCache(): Promise<void> {
    try {
      await this.cache.set(
        RoomsService.VERSION_KEY,
        String(Date.now()),
        24 * 60 * 60 * 1000,
      );
    } catch (error) {
      this.logger.warn(`Could not clear the room cache: ${String(error)}`);
    }
  }

  findPublic(options: Omit<FindRoomsOptions, 'isActive'>) {
    const page = Math.max(1, options.page);
    const limit = Math.min(100, Math.max(1, options.limit));
    return this.cached(
      `list:${page}:${limit}:${options.minCapacity ?? '-'}`,
      () => this.findAll({ ...options, page, limit, isActive: true }),
    );
  }

  findPublicOne(id: number) {
    return this.cached(`one:${id}`, async () => {
      const room = await this.findOne(id);
      if (!room.is_active) {
        throw new NotFoundException(`Room ${id} not found`);
      }
      return room;
    });
  }

  async setImage(id: number, imageUrl: string) {
    await this.findOne(id);
    const room = await this.prisma.rooms.update({
      where: { id },
      data: { image_url: imageUrl, updated_at: new Date() },
    });
    await this.invalidateCache();
    this.logger.log(`Image set for room id=${id}`);
    return room;
  }

  async create(createRoomDto: CreateRoomDto) {
    this.logger.log(`Creating room: ${createRoomDto.name}`);
    try {
      const room = await this.prisma.rooms.create({ data: createRoomDto });
      await this.invalidateCache();
      return room;
    } catch (error) {
      this.logger.error(
        `Failed to create room: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async findAll(options: FindRoomsOptions) {
    this.logger.log('Fetching all rooms');
    const page = Math.max(1, options.page);
    const limit = Math.min(100, Math.max(1, options.limit));

    const where = {
      ...(options.isActive !== undefined && { is_active: options.isActive }),
      ...(options.minCapacity !== undefined && {
        capacity: { gte: options.minCapacity },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.rooms.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.rooms.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async search(query: SearchRoomsQueryDto) {
    const { checkIn, checkOut } = parseStayRange(
      query.check_in,
      query.check_out,
    );
    const where: Prisma.roomsWhereInput = {
      is_active: true,
      ...(query.capacity !== undefined && {
        capacity: { gte: query.capacity },
      }),
      bookings: {
        none: {
          status: { not: BookingStatus.CANCELLED },
          check_in: { lt: checkOut },
          check_out: { gt: checkIn },
        },
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.rooms.findMany({
        where,
        orderBy: { price_per_night: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.rooms.count({ where }),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  async findOne(id: number) {
    this.logger.log(`Fetching room id=${id}`);
    const room = await this.prisma.rooms.findUnique({ where: { id } });

    if (!room) {
      this.logger.warn(`Room ${id} not found`);
      throw new NotFoundException(`Room ${id} not found`);
    }
    return room;
  }

  async update(id: number, updateRoomDto: UpdateRoomDto) {
    this.logger.log(`Updating room id=${id}`);
    try {
      await this.findOne(id);
      const room = await this.prisma.rooms.update({
        where: { id },
        data: { ...updateRoomDto, updated_at: new Date() },
      });
      await this.invalidateCache();
      return room;
    } catch (error) {
      this.logger.error(
        `Failed to update room id=${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async remove(id: number) {
    this.logger.log(`Removing room id=${id}`);
    try {
      await this.findOne(id);
      const room = await this.prisma.rooms.delete({ where: { id } });
      await this.invalidateCache();
      return room;
    } catch (error) {
      this.logger.error(
        `Failed to remove room id=${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async disable(id: number) {
    this.logger.log(`Disabling room id=${id}`);
    try {
      await this.findOne(id);
      const room = await this.prisma.rooms.update({
        where: { id },
        data: { is_active: false },
      });
      await this.invalidateCache();
      return room;
    } catch (error) {
      this.logger.error(
        `Failed to disable room id=${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async enable(id: number) {
    this.logger.log(`Enabling room id=${id}`);
    try {
      await this.findOne(id);
      const room = await this.prisma.rooms.update({
        where: { id },
        data: { is_active: true },
      });
      await this.invalidateCache();
      return room;
    } catch (error) {
      this.logger.error(
        `Failed to enable room id=${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
