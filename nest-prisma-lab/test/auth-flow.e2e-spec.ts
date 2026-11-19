import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';

jest.mock('@keyv/redis', () => ({ createKeyv: jest.fn(() => ({})) }));
const store = new Map<string, unknown>();
const cacheMock = {
  get: jest.fn((key: string) => Promise.resolve(store.get(key))),
  set: jest.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  del: jest.fn((key: string) => Promise.resolve(store.delete(key))),
  clear: jest.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
};

process.env.DISABLE_THROTTLE = 'true';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
jest.setTimeout(60_000);

const at = (day: number, hour = 12) =>
  new Date(Date.UTC(2041, 0, day, hour)).toISOString();

describe('Customer journey (e2e, real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: number;
  let roomId: number;
  let bookingId: number;
  const stamp = Date.now();
  const email = `e2e_journey_${stamp}@example.com`;
  const password = 'Journey123!';
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheMock)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService, { strict: false });
    const room = await prisma.rooms.create({
      data: {
        name: `E2E journey room ${stamp}`,
        capacity: 985,
        price_per_night: 90,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.notifications.deleteMany({ where: { user_id: userId } });
    await prisma.bookings.deleteMany({ where: { room_id: roomId } });
    await prisma.rooms.deleteMany({ where: { id: roomId } });
    await prisma.users.deleteMany({ where: { email } });
    await app.close();
  });

  it('signs up as a regular user and never gets the password back (FR-1, FR-5, NFR-4)', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ name: 'Journey User', email, password })
      .expect(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Account created',
    });
    expect(res.body.data).toMatchObject({ email, role: 'USER' });
    expect(res.body.data).not.toHaveProperty('password');
    userId = res.body.data.id;

    const row = await prisma.users.findUniqueOrThrow({ where: { id: userId } });
    expect(row.password).not.toBe(password);
    expect(row.password).toMatch(/^\$2[aby]\$/);
  });

  it('refuses to register the same e-mail twice (409) and bad input (400)', async () => {
    await http()
      .post('/auth/register')
      .send({ name: 'Again', email, password })
      .expect(409);
    const bad = await http()
      .post('/auth/register')
      .send({ name: '', email: 'nope', password: '1' })
      .expect(400);
    expect(bad.body.errors.length).toBeGreaterThan(0);
    await http()
      .post('/auth/register')
      .send({ name: 'X', email: `x${email}`, password, role: 'ADMIN' })
      .expect(400);
  });

  it('logs in with the right password and rejects a wrong one (FR-2)', async () => {
    await http()
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    const res = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(res.body.data.access_token).toEqual(expect.any(String));
    token = res.body.data.access_token;
  });

  it('shows and updates the own profile (FR-3, FR-4)', async () => {
    const me = await http().get('/users/me').set(auth()).expect(200);
    expect(me.body.data.email).toBe(email);
    expect(me.body.data).not.toHaveProperty('password');

    const upd = await http()
      .patch('/users/me')
      .set(auth())
      .send({ name: 'Renamed User' })
      .expect(200);
    expect(upd.body.message).toBe('Profile updated');
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: userId } })).name,
    ).toBe('Renamed User');

    await http()
      .patch('/users/me')
      .set(auth())
      .send({ password: 'NewPassw0rd!' })
      .expect(400); 
    await http().get('/users/me').expect(401);
  });

  it('finds the room for free dates by capacity (FR-27 to FR-29)', async () => {
    const res = await http()
      .get(`/rooms/search?check_in=${at(5)}&check_out=${at(7)}&capacity=985`)
      .expect(200);
    expect(res.body.data.map((r: { id: number }) => r.id)).toContain(roomId);
  });

  it('books it and stores a PENDING booking plus a notification (FR-17, FR-22, FR-30)', async () => {
    const res = await http()
      .post('/bookings')
      .set(auth())
      .send({ room_id: roomId, check_in: at(5), check_out: at(7) })
      .expect(201);
    bookingId = res.body.data.id;

    const row = await prisma.bookings.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(row).toMatchObject({
      user_id: userId,
      room_id: roomId,
      status: 'PENDING',
    });
    expect(
      await prisma.notifications.count({
        where: { booking_id: bookingId, type: 'BOOKING_CREATED' },
      }),
    ).toBe(1);
  });

  it('no longer lists the room for those dates', async () => {
    const res = await http()
      .get(`/rooms/search?check_in=${at(5)}&check_out=${at(7)}&capacity=985`)
      .expect(200);
    expect(res.body.data.map((r: { id: number }) => r.id)).not.toContain(
      roomId,
    );
  });

  it('cancels the booking: status, notification and availability all change (FR-26, FR-31)', async () => {
    const res = await http()
      .patch(`/bookings/${bookingId}/cancel`)
      .set(auth())
      .expect(200);
    expect(res.body.data.status).toBe('CANCELLED');

    expect(
      (await prisma.bookings.findUniqueOrThrow({ where: { id: bookingId } }))
        .status,
    ).toBe('CANCELLED');
    expect(
      await prisma.notifications.count({
        where: { booking_id: bookingId, type: 'BOOKING_CANCELLED' },
      }),
    ).toBe(1);

    const notes = await http().get('/notifications').set(auth()).expect(200);
    expect(notes.body.data.map((n: { type: string }) => n.type).sort()).toEqual(
      ['BOOKING_CANCELLED', 'BOOKING_CREATED'],
    );

    const search = await http()
      .get(`/rooms/search?check_in=${at(5)}&check_out=${at(7)}&capacity=985`)
      .expect(200);
    expect(search.body.data.map((r: { id: number }) => r.id)).toContain(roomId);
  });

  it('logs out and the token stops working at once (FR-2)', async () => {
    await http().post('/auth/logout').set(auth()).expect(200);
    await http().get('/users/me').set(auth()).expect(401);
  });
});
