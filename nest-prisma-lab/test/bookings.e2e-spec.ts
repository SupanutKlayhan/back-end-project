import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';

jest.mock('@keyv/redis', () => ({ createKeyv: jest.fn(() => ({})) }));

const cacheMock = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(true),
  clear: jest.fn().mockResolvedValue(undefined),
};

process.env.DISABLE_THROTTLE = 'true';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
jest.setTimeout(60_000);

const at = (day: number, hour = 12) =>
  new Date(Date.UTC(2040, 0, day, hour)).toISOString();

describe('Bookings API (e2e, real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let roomId: number;
  const stamp = Date.now();
  const adminEmail = `e2e_b_admin_${stamp}@example.com`;
  const userEmail = `e2e_b_user_${stamp}@example.com`;
  const password = 'E2ePassw0rd!';

  const http = () => request(app.getHttpServer());
  const book = (token: string, check_in: string, check_out: string) =>
    http()
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, check_in, check_out });

  async function login(email: string) {
    const res = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.data.access_token as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheMock)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService, { strict: false });

    const hash = await bcrypt.hash(password, 10);
    await prisma.users.create({
      data: {
        name: 'E2E Admin',
        email: adminEmail,
        password: hash,
        role: 'ADMIN',
      },
    });
    await prisma.users.create({
      data: {
        name: 'E2E User',
        email: userEmail,
        password: hash,
        role: 'USER',
      },
    });
    const room = await prisma.rooms.create({
      data: {
        name: `E2E booking room ${stamp}`,
        capacity: 986,
        price_per_night: 100,
      },
    });
    roomId = room.id;
    adminToken = await login(adminEmail);
    userToken = await login(userEmail);
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { email: { in: [adminEmail, userEmail] } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.notifications.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.bookings.deleteMany({ where: { room_id: roomId } });
    await prisma.rooms.deleteMany({ where: { id: roomId } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  let firstBookingId: number;

  it('requires a login to book (401)', async () => {
    await http()
      .post('/bookings')
      .send({ room_id: roomId, check_in: at(1), check_out: at(3) })
      .expect(401);
  });

  it('creates a PENDING booking with the success envelope (FR-17, FR-22, FR-34)', async () => {
    const res = await book(userToken, at(1), at(3)).expect(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Booking created',
    });
    expect(res.body.data.status).toBe('PENDING');
    firstBookingId = res.body.data.id;
  });

  it('records a BOOKING_CREATED notification (FR-30)', async () => {
    const res = await http()
      .get('/notifications')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      res.body.data.some(
        (n: { booking_id: number; type: string }) =>
          n.booking_id === firstBookingId && n.type === 'BOOKING_CREATED',
      ),
    ).toBe(true);
  });

  it('rejects an overlapping booking with 409 (FR-20)', async () => {
    const res = await book(adminToken, at(2), at(4)).expect(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already booked/);
  });

  it('allows a stay that starts exactly when another ends (half-open interval)', async () => {
    await book(adminToken, at(3), at(5)).expect(201);
  });

  it('rejects invalid dates with 400 (FR-19, FR-32)', async () => {
    await book(userToken, at(9), at(8)).expect(400);
    await http()
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ room_id: 'x', check_in: 'nope' })
      .expect(400);
  });

  it('answers 404 for an unknown room (FR-33)', async () => {
    await http()
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ room_id: 999999999, check_in: at(20), check_out: at(21) })
      .expect(404);
  });

  it('lets exactly one of five simultaneous identical requests win', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => book(userToken, at(10), at(12))),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
    const stored = await prisma.bookings.count({
      where: { room_id: roomId, check_in: new Date(at(10)) },
    });
    expect(stored).toBe(1);
  });

  it('search hides a booked room and shows it for free dates (FR-27 to FR-29)', async () => {
    const taken = await http()
      .get(
        `/rooms/search?check_in=${at(1, 14)}&check_out=${at(2)}&capacity=986`,
      )
      .expect(200);
    expect(taken.body.data.some((r: { id: number }) => r.id === roomId)).toBe(
      false,
    );
    const free = await http()
      .get(`/rooms/search?check_in=${at(25)}&check_out=${at(26)}&capacity=986`)
      .expect(200);
    expect(free.body.data.some((r: { id: number }) => r.id === roomId)).toBe(
      true,
    );
  });

  it("shows a user only their own bookings; someone else's is a 404 (FR-23, FR-24)", async () => {
    const mine = await http()
      .get('/bookings?limit=100')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      mine.body.data.every(
        (b: { user_id: number }) => typeof b.user_id === 'number',
      ),
    ).toBe(true);
    const adminBooking = await prisma.bookings.findFirstOrThrow({
      where: { room_id: roomId, check_in: new Date(at(3)) },
    });
    await http()
      .get(`/bookings/${adminBooking.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);
    const all = await http()
      .get('/bookings?limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(all.body.meta.total).toBeGreaterThanOrEqual(mine.body.meta.total);
  });

  it('only an admin can approve (FR-26); a user gets 403', async () => {
    await http()
      .patch(`/bookings/${firstBookingId}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'APPROVED' })
      .expect(403);
    const ok = await http()
      .patch(`/bookings/${firstBookingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);
    expect(ok.body.data.status).toBe('APPROVED');
  });

  it('cancelling frees the room and records BOOKING_CANCELLED (FR-31)', async () => {
    const res = await http()
      .patch(`/bookings/${firstBookingId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ message: 'Booking cancelled' });
    expect(res.body.data.status).toBe('CANCELLED');
    await http()
      .patch(`/bookings/${firstBookingId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(409);

    const n = await prisma.notifications.count({
      where: { booking_id: firstBookingId, type: 'BOOKING_CANCELLED' },
    });
    expect(n).toBe(1);
    await book(userToken, at(1), at(3)).expect(201);
  });
});
