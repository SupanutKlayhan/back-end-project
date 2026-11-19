import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const accounts = [
  {
    name: 'Hotel Admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
    role: Role.ADMIN,
  },
  {
    name: 'Test User',
    email: process.env.SEED_USER_EMAIL ?? 'user@example.com',
    password: process.env.SEED_USER_PASSWORD ?? 'User1234!',
    role: Role.USER,
  },
];

const rooms = [
  {
    name: 'Standard Single',
    capacity: 1,
    price_per_night: 800,
    description: 'Single bed, city view',
  },
  {
    name: 'Standard Double',
    capacity: 2,
    price_per_night: 1200,
    description: 'Double bed, work desk',
  },
  {
    name: 'Deluxe Ocean View',
    capacity: 2,
    price_per_night: 1800,
    description: 'King bed, private balcony, sea view',
  },
  {
    name: 'Family Suite',
    capacity: 4,
    price_per_night: 2800,
    description: 'Two bedrooms, living area',
  },
  {
    name: 'Presidential Suite',
    capacity: 6,
    price_per_night: 6500,
    description: 'Top floor, lounge and kitchenette',
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing');
  }
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

  try {
    for (const account of accounts) {
      const password = await bcrypt.hash(account.password, 12);
      await prisma.users.upsert({
        where: { email: account.email },
        update: {},
        create: {
          name: account.name,
          email: account.email,
          password,
          role: account.role,
        },
      });
      console.log(`user ready: ${account.email} (${account.role})`);
    }

    for (const room of rooms) {
      const existing = await prisma.rooms.findFirst({
        where: { name: room.name },
      });
      if (!existing) {
        await prisma.rooms.create({ data: room });
        console.log(`room created: ${room.name}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
