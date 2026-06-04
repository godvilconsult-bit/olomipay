/**
 * Shared Prisma client (singleton).
 *
 * Previously every route/service created its own `new PrismaClient()` — 45 of
 * them — each opening a separate connection pool, which exhausts Postgres
 * connection limits under load and slows everything down. This module exposes
 * ONE client reused everywhere. In dev it's cached on globalThis so hot-reload
 * doesn't spawn new pools.
 */
import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __olomiPrisma?: PrismaClient };

export const prisma: PrismaClient =
  g.__olomiPrisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') g.__olomiPrisma = prisma;
