import { Role } from '@prisma/client';

export interface AuthUser {
  userId: number;
  email: string;
  role: Role;
  jti?: string;
  exp?: number;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  jti?: string;
  exp?: number;
  iat?: number;
}
