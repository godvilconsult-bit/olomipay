/**
 * Boots a throwaway Postgres for the integration suite using the same
 * embedded-postgres package as `npm run pg` — no Docker, no system install.
 *
 * The data directory is wiped on every run so the suite always starts from a
 * known-empty schema; nothing leaks between runs.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TEST_DATABASE_URL, TEST_PG_PORT } from './config';

let pg: EmbeddedPostgres | null = null;

export async function setup(): Promise<void> {
  const databaseDir = path.join(process.cwd(), '.pgdata-test');

  // A crashed previous run can leave the directory behind; starting on top of it
  // would resurrect stale rows and make assertions non-deterministic.
  if (existsSync(databaseDir)) {
    try {
      rmSync(databaseDir, { recursive: true, force: true });
    } catch {
      throw new Error(
        `Could not remove ${databaseDir}. A previous test Postgres may still be ` +
        `running — kill it and retry.`,
      );
    }
  }

  pg = new EmbeddedPostgres({
    databaseDir,
    user:       'postgres',
    password:   'postgres',
    port:       TEST_PG_PORT,
    persistent: false,
    // Without this, initdb on Windows picks WIN1252 from the system locale and
    // every emoji in a notification title fails to insert. notify() swallows the
    // error, so the suite would stay green while silently testing nothing.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('jiko_test');

  // Build the schema straight from schema.prisma. Using db push rather than
  // migrate keeps the suite independent of migration history.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd:   process.cwd(),
    env:   { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  if (pg) await pg.stop().catch(() => {});
}
