import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { chatRouter } from './routes/chat';
import { initSocket } from './socket';

// Phase 1 + 2 routes
import { authRouter }          from './routes/auth';
import { walletRouter }        from './routes/wallet';
import { mpesaRouter }         from './routes/mpesa';
import { sendRouter }          from './routes/send';
import { kycRouter }           from './routes/kyc';
import { adminRouter }         from './routes/admin';
import { savingsRouter }       from './routes/savings';
import { billsRouter }         from './routes/bills';
import { contactsRouter }      from './routes/contacts';
import { scheduleRouter }      from './routes/schedule';
import { withdrawRouter }      from './routes/withdraw';
import { notificationsRouter } from './routes/notifications';

// Phase 3 routes
import { stakeRouter }   from './routes/stake';
import { chamaRouter }         from './routes/chama';
import { swapRouter }          from './routes/swap';
import { lendingRouter }       from './routes/lending';
import { rewardsRouter }       from './routes/rewards';
import { creditRouter }        from './routes/credit';
import { cardRouter }          from './routes/card';
import { pricelockRouter }     from './routes/pricelock';

import { startScheduler }      from './services/scheduler';
import { setupDatabase }       from './services/dbSetup';

const app  = express();
const PORT = process.env.PORT ?? 3001;

// Trust Railway/Vercel reverse proxy so rate-limit reads the real client IP
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = [
  process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  'http://localhost:3000',
  'https://olomipay.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

// ── Phase 1 + 2 Routes ────────────────────────────────────────────────────────
app.use('/api/auth',          authRouter);
app.use('/api/wallet',        walletRouter);
app.use('/api/mpesa',         mpesaRouter);
app.use('/api/send',          sendRouter);
app.use('/api/kyc',           kycRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/savings',       savingsRouter);
app.use('/api/bills',         billsRouter);
app.use('/api/contacts',      contactsRouter);
app.use('/api/schedule',      scheduleRouter);
app.use('/api/withdraw',      withdrawRouter);
app.use('/api/notifications', notificationsRouter);

// ── Phase 3 Routes ────────────────────────────────────────────────────────────
app.use('/api/stake',         stakeRouter);
app.use('/api/chama',         chamaRouter);
app.use('/api/swap',          swapRouter);
app.use('/api/lending',       lendingRouter);
app.use('/api/rewards',       rewardsRouter);
app.use('/api/credit',        creditRouter);
app.use('/api/card',          cardRouter);
app.use('/api/pricelock',     pricelockRouter);

// ── Phase 4 Routes ────────────────────────────────────────────────────────────
import { merchantRouter }  from './routes/merchant';
import { payrollRouter }   from './routes/payroll';
import { govRouter }       from './routes/gov';
import { bondsRouter }     from './routes/bonds';
import { developerRouter } from './routes/developer';

app.use('/api/merchant',   merchantRouter);
app.use('/api/payroll',    payrollRouter);
app.use('/api/gov',        govRouter);
app.use('/api/bonds',      bondsRouter);
app.use('/api/developer',  developerRouter);
app.use('/api/chat',       chatRouter);

import { mediaRouter } from './routes/media';
app.use('/api/chat/media', mediaRouter);

// ── One-time DB migration endpoint ───────────────────────────────────────────
app.get('/setup-db', async (_req, res) => {
  const secret = _req.query.secret;
  if (secret !== process.env.JWT_SECRET?.slice(0, 16)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const { execSync } = await import('child_process');
    const output = execSync('npx prisma db push --accept-data-loss', {
      cwd: '/app',
      encoding: 'utf8',
      timeout: 120_000,
    });
    return res.json({ success: true, output });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status:  'ok',
  ts:      new Date().toISOString(),
  phase:   4,
  version: '4.0.0',
}));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, async () => {
  console.log(`Tuma API Phase 4 + Chat on :${PORT}`);
  await setupDatabase();
  startScheduler();
});

export default app;
