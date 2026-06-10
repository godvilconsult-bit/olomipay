/**
 * Local dev Postgres — a self-contained embedded server on :5433, no Docker or
 * system install required. Keeps running until killed.
 *
 *   npm run pg
 *
 * Connect with:  postgresql://postgres:postgres@localhost:5433/jiko
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const databaseDir = path.join(process.cwd(), '.pgdata');
const fresh = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

if (fresh) {
  console.log('[pg] initialising data dir…');
  await pg.initialise();
}
await pg.start();
try { await pg.createDatabase('jiko'); } catch { /* already exists */ }
console.log('[pg] ready → postgresql://postgres:postgres@localhost:5433/jiko');

const shutdown = async () => { try { await pg.stop(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30); // keep alive
