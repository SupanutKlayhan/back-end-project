import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

describe('BookingsService (unit)', () => {
  let service: BookingsService;

  const tx = {
    $queryRaw: jest.fn(),
    rooms: { findUnique: jest.fn() },
    bookings: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notifications: { create: jest.fn() },
  };
  const prismaMock = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };

  const future = () => ({
    room_id: 1,
    check_in: new Date(Date.now() + 86_400_000).toISOString(),
    check_out: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  });
  const room = { id: 1, name: 'Deluxe', is_active: true };
  const user = { userId: 7, email: 'u@x.com', role: 'USER' as const };
  const admin = { userId: 1, email: 'a@x.com', role: 'ADMIN' as const };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      (fn: (t: typeof tx) => unknown) => fn(tx),
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(BookingsService);
  });

  describe('create', () => {
    it('locks the room, saves the booking and its notification together', async () => {
      tx.rooms.findUnique.mockResolvedValue(room);
      tx.bookings.findFirst.mockResolvedValue(null);
      tx.bookings.create.mockResolvedValue({ id: 5 });

      const result = await service.create(7, future());

      expect(result).toEqual({ id: 5 });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user_id: 7, room_id: 1 }),
        }),
      );
      expect(tx.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 7,
          booking_id: 5,
          type: 'BOOKING_CREATED',
        }),
      });
    });

    it('answers 409 and writes nothing when the dates overlap (FR-20)', async () => {
      tx.rooms.findUnique.mockResolvedValue(room);
      tx.bookings.findFirst.mockResolvedValue({ id: 3 });

      await expect(service.create(7, future())).rejects.toThrow(
        ConflictException,
      );
      expect(tx.bookings.create).not.toHaveBeenCalled();
      expect(tx.notifications.create).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing or inactive room', async () => {
      tx.rooms.findUnique.mockResolvedValue(null);
      await expect(service.create(7, future())).rejects.toThrow(
        NotFoundException,
      );
      tx.rooms.findUnique.mockResolvedValue({ ...room, is_active: false });
      await expect(service.create(7, future())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects invalid dates before touching the database', async () => {
      await expect(
        service.create(7, {
          room_id: 1,
          check_in: '2030-01-02T00:00:00Z',
          check_out: '2030-01-01T00:00:00Z',
        }),
      ).rejects.toThrow('check_in must be before check_out');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cancel / updateStatus', () => {
    const pending = {
      id: 9,
      user_id: 7,
      status: 'PENDING',
      room: { name: 'Deluxe' },
    };

    it('lets the owner cancel and records a BOOKING_CANCELLED notification (FR-31)', async () => {
      tx.bookings.findUnique.mockResolvedValue(pending);
      tx.bookings.update.mockResolvedValue({ ...pending, status: 'CANCELLED' });

      const result = await service.cancel(user, 9);

      expect(result.status).toBe('CANCELLED');
      expect(tx.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 7,
          booking_id: 9,
          type: 'BOOKING_CANCELLED',
        }),
      });
    });

    it("hides someone else's booking behind a 404", async () => {
      tx.bookings.findUnique.mockResolvedValue({ ...pending, user_id: 99 });
      await expect(service.cancel(user, 9)).rejects.toThrow(NotFoundException);
    });

    it('refuses a user who tries to approve (409 from the transition table)', async () => {
      tx.bookings.findUnique.mockResolvedValue(pending);
      await expect(service.updateStatus(user, 9, 'APPROVED')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.bookings.update).not.toHaveBeenCalled();
    });

    it('lets an admin approve without creating a notification', async () => {
      tx.bookings.findUnique.mockResolvedValue(pending);
      tx.bookings.update.mockResolvedValue({ ...pending, status: 'APPROVED' });
      await service.updateStatus(admin, 9, 'APPROVED');
      expect(tx.notifications.create).not.toHaveBeenCalled();
    });

    it('refuses to change a booking that is already CANCELLED', async () => {
      tx.bookings.findUnique.mockResolvedValue({
        ...pending,
        status: 'CANCELLED',
      });
      await expect(service.cancel(user, 9)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll / findOne', () => {
    it('limits a regular user to their own bookings', async () => {
      prismaMock.$transaction.mockReset();
      const p = prismaMock as unknown as { bookings: object };
      Object.assign(p, {
        bookings: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      });
      await service.findAll(user, { page: 1, limit: 10 } as never);
      const { findMany } = (p as { bookings: { findMany: jest.Mock } })
        .bookings;
      expect(findMany.mock.calls[0][0].where.user_id).toBe(7);
    });
  });
});
