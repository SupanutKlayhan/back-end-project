import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { paginated } from '../common/dto/pagination-query.dto';
import { parseStayRange } from '../common/utils/stay-range';
import { PrismaService } from '../prisma/prisma.service';
import { canTransition } from './booking-status';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';

const bookingInclude = {
  room: { select: { id: true, name: true, price_per_night: true } },
} satisfies Prisma.bookingsInclude;

const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };

@Injectable()
export class BookingsService {
  private readonly logger = new Logger('BookingsService');

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateBookingDto) {
    const { checkIn, checkOut } = parseStayRange(dto.check_in, dto.check_out);

    const booking = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${dto.room_id} FOR UPDATE`;

      const room = await tx.rooms.findUnique({ where: { id: dto.room_id } });
      if (!room || !room.is_active) {
        throw new NotFoundException(`Room ${dto.room_id} not found`);
      }

      const conflict = await tx.bookings.findFirst({
        where: {
          room_id: dto.room_id,
          status: { not: BookingStatus.CANCELLED },
          check_in: { lt: checkOut },
          check_out: { gt: checkIn },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException(
          'Room is already booked for the selected dates',
        );
      }

      const created = await tx.bookings.create({
        data: {
          user_id: userId,
          room_id: dto.room_id,
          check_in: checkIn,
          check_out: checkOut,
        },
        include: bookingInclude,
      });
      await tx.notifications.create({
        data: {
          user_id: userId,
          booking_id: created.id,
          type: 'BOOKING_CREATED',
          message: `Booking #${created.id} for "${room.name}" was created and is pending approval`,
        },
      });
      return created;
    }, TX_OPTIONS);

    this.logger.log(
      `Booking created id=${booking.id} user=${userId} room=${dto.room_id}`,
    );
    return booking;
  }

  async findAll(user: AuthUser, query: ListBookingsQueryDto) {
    const isAdmin = user.role === Role.ADMIN;
    const where: Prisma.bookingsWhereInput = {
      user_id: isAdmin ? query.user_id : user.userId,
      status: query.status,
    };
    const [data, total] = await Promise.all([
      this.prisma.bookings.findMany({
        where,
        include: bookingInclude,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.bookings.count({ where }),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: number) {
    const booking = await this.prisma.bookings.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking || !this.canAccess(user, booking.user_id)) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  cancel(user: AuthUser, id: number) {
    return this.transition(user, id, BookingStatus.CANCELLED);
  }

  updateStatus(user: AuthUser, id: number, status: BookingStatus) {
    return this.transition(user, id, status);
  }

  private canAccess(user: AuthUser, ownerId: number): boolean {
    return user.role === Role.ADMIN || ownerId === user.userId;
  }

  private async transition(user: AuthUser, id: number, to: BookingStatus) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;

      const booking = await tx.bookings.findUnique({
        where: { id },
        include: bookingInclude,
      });
      if (!booking || !this.canAccess(user, booking.user_id)) {
        throw new NotFoundException(`Booking ${id} not found`);
      }
      if (!canTransition(booking.status, to, user.role)) {
        throw new ConflictException(
          `Cannot change booking status from ${booking.status} to ${to}`,
        );
      }

      const result = await tx.bookings.update({
        where: { id },
        data: { status: to },
        include: bookingInclude,
      });
      if (to === BookingStatus.CANCELLED) {
        await tx.notifications.create({
          data: {
            user_id: booking.user_id,
            booking_id: id,
            type: 'BOOKING_CANCELLED',
            message: `Booking #${id} for "${booking.room.name}" was cancelled`,
          },
        });
      }
      return result;
    }, TX_OPTIONS);

    this.logger.log(
      `Booking id=${id} -> ${to} by user=${user.userId} (${user.role})`,
    );
    return updated;
  }
}
