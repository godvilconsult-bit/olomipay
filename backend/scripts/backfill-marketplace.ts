/**
 * CLI wrapper for the phase 2 backfill. The logic lives in
 * src/services/backfill.ts so it sits inside rootDir and is directly testable.
 *
 *   npm run backfill            # write
 *   npm run backfill -- --dry-run   # count only
 */
import { backfillMarketplace } from '../src/services/backfill';
import { prisma } from '../src/lib/prisma';

const dryRun = process.argv.includes('--dry-run');

backfillMarketplace({ dryRun })
  .then(async (stats) => {
    console.log('\n[backfill] done:', JSON.stringify(stats, null, 2));
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('[backfill] FAILED:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
