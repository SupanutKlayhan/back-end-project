import { config } from 'dotenv';

config({ path: '.env.test', override: true, quiet: true });


if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('e2e: DATABASE_URL must point to a *_test database. Copy .env.test.example to .env.test (see README 11.2)');
}