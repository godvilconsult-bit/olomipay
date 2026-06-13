import 'dotenv/config';
import express from 'express';
import 'express-async-errors';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => cb(null, true), // open during build-out; lock down per-env later
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.options('*', cors());
app.use(express.json({ limit: '5mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// ── Health ────────────────────────────────────────────────────────────────────
const health = () => ({ status: 'ok', app: 'JIKO CONNECT', version: '1.0.0', ts: new Date().toISOString() });
app.get('/health',     (_req, res) => res.json(health()));
app.get('/api/health', (_req, res) => res.json(health()));
app.get('/ready', async (_req, res) => {
  try {
    const { prisma } = await import('./lib/prisma');
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ ready: true, db: 'up' });
  } catch (e: any) {
    res.status(503).json({ ready: false, error: e.message });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────────
async function loadRoutes() {
  const mounts: [string, () => Promise<any>, string][] = [
    ['/api/auth',      () => import('./routes/auth'),      'authRouter'],
    ['/api/vendors',   () => import('./routes/vendors'),   'vendorsRouter'],
    ['/api/orders',    () => import('./routes/orders'),    'ordersRouter'],
    ['/api/jobs',      () => import('./routes/jobs'),      'jobsRouter'],
    ['/api/suppliers', () => import('./routes/suppliers'), 'suppliersRouter'],
    ['/api/payments',  () => import('./routes/payments'),  'paymentsRouter'],
    ['/api/addresses', () => import('./routes/addresses'), 'addressesRouter'],
    ['/api/notifications', () => import('./routes/notifications'), 'notificationsRouter'],
    ['/api/kyc',       () => import('./routes/kyc'),       'kycRouter'],
    ['/api/ads',       () => import('./routes/ads'),       'adsRouter'],
    ['/api/wallet',    () => import('./routes/wallet'),    'walletRouter'],
    ['/api/subscriptions', () => import('./routes/subscriptions'), 'subscriptionsRouter'],
    ['/api/referrals', () => import('./routes/referrals'), 'referralsRouter'],
    ['/api/admin',     () => import('./routes/admin'),     'adminRouter'],
  ];
  for (const [path, load, name] of mounts) {
    try { const mod = await load(); app.use(path, mod[name]); }
    catch (e: any) { console.error(`[route] ${path} failed:`, e.message); }
  }
  console.log('[routes] loaded');
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.http ?? 500;
  if (status >= 500) console.error('[error]', err?.message);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const httpServer = createServer(app);
httpServer.listen(PORT, async () => {
  console.log(`JIKO CONNECT API on :${PORT}`);

  // Ensure the DB schema matches prisma/schema.prisma. Runs here (not just in
  // start.sh) because some deploy targets override the container start command
  // and skip the script. `db push` is idempotent — a no-op when already in sync.
  if (process.env.DATABASE_URL) {
    try {
      const { execSync } = await import('child_process');
      // JIKO_DB_RESET=1 forces a full reset — used ONCE to drop a previous
      // project's schema. Leave it unset afterwards so deploys never wipe data.
      const reset = process.env.JIKO_DB_RESET === '1' ? ' --force-reset' : '';
      console.log(`[schema] prisma db push${reset}…`);
      execSync(`npx prisma db push --accept-data-loss --skip-generate${reset}`, { stdio: 'inherit', timeout: 120_000 });
      console.log('[schema] in sync');
    } catch (e: any) { console.error('[schema] db push failed:', e?.message); }
  }

  await loadRoutes();
  try {
    const { initSocket } = await import('./socket');
    initSocket(httpServer);
    console.log('[socket] initialized');
  } catch (e: any) { console.error('[socket] failed:', e.message); }
  try {
    const { seedIfEmpty } = await import('./services/seedData');
    await seedIfEmpty();
  } catch (e: any) { console.error('[seed]', e.message); }
  try {
    const { startSubscriptionScheduler } = await import('./services/subscriptions');
    startSubscriptionScheduler();
  } catch (e: any) { console.error('[subscriptions]', e.message); }
});

export default app;
