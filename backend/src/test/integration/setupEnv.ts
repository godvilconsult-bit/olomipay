/**
 * Runs before each test file's imports are evaluated, which matters: lib/prisma
 * builds its client from DATABASE_URL at module load, so this has to win the race.
 */
import { TEST_DATABASE_URL } from './config';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = process.env.JWT_SECRET ?? 'test-secret';

// Pin the money knobs so a developer's local .env can never change what these
// characterization tests assert. These are the documented defaults from fees.ts.
process.env.JIKO_COMMISSION_FREE       = '0.08';
process.env.JIKO_COMMISSION_STANDARD   = '0.06';
process.env.JIKO_COMMISSION_PREMIUM    = '0.05';
process.env.JIKO_COMMISSION_ACCESSORY  = '0.12';
process.env.JIKO_SERVICE_FEE           = '500';
process.env.JIKO_SERVICE_FEE_PCT       = '0';
process.env.JIKO_DELIVERY_BASE         = '2000';
process.env.JIKO_DELIVERY_PER_KM       = '500';
process.env.JIKO_DELIVERY_MARGIN_PCT   = '0.15';
process.env.JIKO_LOW_STOCK             = '3';
