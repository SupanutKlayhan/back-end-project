import 'dotenv/config';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL'] as const;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
