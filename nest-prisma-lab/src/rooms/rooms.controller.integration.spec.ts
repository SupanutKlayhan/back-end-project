import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

describe('RoomsController (integration, service mocked)', () => {
  let app: INestApplication;

  const roomsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findPublic: jest.fn(),
    findPublicOne: jest.fn(),
    setImage: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
  };

  const room = {
    id: 1,
    name: 'Deluxe Ocean View',
    description: 'King bed, balcony',
    capacity: 2,
    price_per_night: '1500.50',
    image_url: '/images/room101.jpg',
    is_active: true,
    created_at: '2026-10-26T01:00:00.000Z',
    updated_at: '2026-10-26T01:00:00.000Z',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: roomsServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /rooms', () => {
    const body = {
      name: 'Deluxe Ocean View',
      capacity: 2,
      price_per_night: 1500.5,
    };

    it('calls service.create and returns the created room', async () => {
      roomsServiceMock.create.mockResolvedValue(room);

      const res = await request(app.getHttpServer()).post('/rooms').send(body);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(room);
      expect(roomsServiceMock.create).toHaveBeenCalledWith(body);
    });

    it('returns 400 and does not call the service when the body is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/rooms')
        .send({ capacity: 'two' });

      expect(res.status).toBe(400);
      expect(roomsServiceMock.create).not.toHaveBeenCalled();
    });
    
    it.each([
      { label: 'capacity 0', override: { capacity: 0 } },
      { label: 'capacity 51', override: { capacity: 51 } },
      { label: 'price 0', override: { price_per_night: 0 } },
      { label: 'price with 3 decimals', override: { price_per_night: 1500.555 } },
      { label: 'price above the maximum', override: { price_per_night: 100_000_000 } },
      { label: 'name longer than 100 characters', override: { name: 'x'.repeat(101) } },
    ])('returns 400 for $label (F2 limits)', async ({ override }) => {
      const res = await request(app.getHttpServer())
        .post('/rooms')
        .send({ ...body, ...override });

      expect(res.status).toBe(400);
      expect(roomsServiceMock.create).not.toHaveBeenCalled();
    });

    it('accepts the boundary values capacity 50 and price 0.01', async () => {
      roomsServiceMock.create.mockResolvedValue(room);
      const edge = { ...body, capacity: 50, price_per_night: 0.01 };

      const res = await request(app.getHttpServer()).post('/rooms').send(edge);

      expect(res.status).toBe(201);
      expect(roomsServiceMock.create).toHaveBeenCalledWith(edge);
    });
  });

  describe('GET /rooms', () => {
    const list = {
      data: [room],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('calls service.findPublic with default paging and returns the list', async () => {
      roomsServiceMock.findPublic.mockResolvedValue(list);

      const res = await request(app.getHttpServer()).get('/rooms');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(list);
      expect(roomsServiceMock.findPublic).toHaveBeenCalledWith({
        minCapacity: undefined,
        page: 1,
        limit: 10,
      });
    });

    it('passes query parameters to the service (the public list is always active-only)', async () => {
      roomsServiceMock.findPublic.mockResolvedValue(list);

      await request(app.getHttpServer())
        .get('/rooms?min_capacity=2&page=2&limit=5')
        .expect(200);

      expect(roomsServiceMock.findPublic).toHaveBeenCalledWith({
        minCapacity: 2,
        page: 2,
        limit: 5,
      });
    });

    it('returns 400 for a non-numeric page', async () => {
      const res = await request(app.getHttpServer()).get('/rooms?page=abc');

      expect(res.status).toBe(400);
      expect(roomsServiceMock.findAll).not.toHaveBeenCalled();
    });
  });

  describe('GET /rooms/:id', () => {
    it('returns the room when it exists', async () => {
      roomsServiceMock.findPublicOne.mockResolvedValue(room);

      const res = await request(app.getHttpServer()).get('/rooms/1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(room);
      expect(roomsServiceMock.findPublicOne).toHaveBeenCalledWith(1);
    });

    it('returns 404 when the service throws NotFoundException', async () => {
      roomsServiceMock.findPublicOne.mockRejectedValue(
        new NotFoundException('Room 99 not found'),
      );

      const res = await request(app.getHttpServer()).get('/rooms/99');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Room 99 not found');
    });

    it('returns 400 when the id is not a number', async () => {
      const res = await request(app.getHttpServer()).get('/rooms/abc');

      expect(res.status).toBe(400);
      expect(roomsServiceMock.findPublicOne).not.toHaveBeenCalled();
    });
  });

  describe('PUT /rooms/:id', () => {
    it('calls service.update with the id and body and returns the result', async () => {
      const body = { name: 'Renamed Room', capacity: 4 };
      const updated = { ...room, ...body };
      roomsServiceMock.update.mockResolvedValue(updated);

      const res = await request(app.getHttpServer()).put('/rooms/1').send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(roomsServiceMock.update).toHaveBeenCalledWith(1, body);
    });

    it('returns 404 when the service throws NotFoundException', async () => {
      roomsServiceMock.update.mockRejectedValue(
        new NotFoundException('Room 99 not found'),
      );

      const res = await request(app.getHttpServer())
        .put('/rooms/99')
        .send({ name: 'x' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /rooms/:id', () => {
    it('calls service.remove with the id and returns the deleted room', async () => {
      roomsServiceMock.remove.mockResolvedValue(room);

      const res = await request(app.getHttpServer()).delete('/rooms/1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(room);
      expect(roomsServiceMock.remove).toHaveBeenCalledWith(1);
    });

    it('returns 404 when the service throws NotFoundException', async () => {
      roomsServiceMock.remove.mockRejectedValue(
        new NotFoundException('Room 99 not found'),
      );

      const res = await request(app.getHttpServer()).delete('/rooms/99');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Room 99 not found');
    });
  });
});
