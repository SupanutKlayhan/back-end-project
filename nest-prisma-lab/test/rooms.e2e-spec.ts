import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/setup-app';
import { Role } from '../src/common/enums/role.enum';
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
jest.setTimeout(30_000);

describe('Rooms API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let roomId: number | undefined;

  const adminEmail = `e2e_admin_${Date.now()}@example.com`;
  const adminPassword = 'E2ePassw0rd!';

  const newRoom = {
    name: 'E2E Test Suite',
    description: 'Created by the e2e test',
    capacity: 49,
    price_per_night: 1234.5,
    image_url: '/images/e2e.jpg',
    is_active: true,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheMock)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService, { strict: false });

    await prisma.users.create({
      data: {
        name: 'E2E Admin',
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 10),
        role: Role.ADMIN,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    token = login.body.data.access_token;
  });

  afterAll(async () => {
    if (roomId !== undefined) {
      await prisma.rooms.deleteMany({ where: { id: roomId } });
    }
    await prisma.users.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('creates a room (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send(newRoom)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Room created');
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.body.data.name).toBe(newRoom.name);
    roomId = res.body.data.id;
  });

  it('rejects creating a room without a token (401)', async () => {
    await request(app.getHttpServer()).post('/rooms').send(newRoom).expect(401);
  });

  it('lists rooms and includes the created room', async () => {
    const res = await request(app.getHttpServer())
      .get('/rooms?min_capacity=49&limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((r: { id: number }) => r.id === roomId)).toBe(
      true,
    );
  });

  it('hides a deactivated room from the public list and details, but not from the admin list', async () => {
    await request(app.getHttpServer())
      .patch(`/rooms/${roomId}/disable`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pub = await request(app.getHttpServer())
      .get('/rooms?min_capacity=49&limit=100')
      .expect(200);
    expect(pub.body.data.some((r: { id: number }) => r.id === roomId)).toBe(
      false,
    );
    await request(app.getHttpServer()).get(`/rooms/${roomId}`).expect(404);

    const admin = await request(app.getHttpServer())
      .get('/rooms/admin/all?is_active=false&min_capacity=49')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(admin.body.data.some((r: { id: number }) => r.id === roomId)).toBe(
      true,
    );
    await request(app.getHttpServer()).get('/rooms/admin/all').expect(401);

    await request(app.getHttpServer())
      .patch(`/rooms/${roomId}/enable`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('gets a single room by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe(roomId);
    expect(res.body.data.name).toBe(newRoom.name);
    expect(res.body.data.capacity).toBe(newRoom.capacity);
    expect(res.body.data.image_url).toBe(newRoom.image_url);
  });

  it('updates a room (200)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2E Test Suite (updated)', capacity: 50 })
      .expect(200);

    expect(res.body.message).toBe('Room updated');
    expect(res.body.data.id).toBe(roomId);
    expect(res.body.data.name).toBe('E2E Test Suite (updated)');
    expect(res.body.data.capacity).toBe(50);
  });

  it('returns 404 when updating a room that does not exist', async () => {
    await request(app.getHttpServer())
      .put('/rooms/999999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'does not exist' })
      .expect(404);
  });

  it('deletes a room (200)', async () => {
    await request(app.getHttpServer())
      .delete(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns 404 for the deleted room', async () => {
    await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
