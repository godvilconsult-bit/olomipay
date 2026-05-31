import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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
import { stakeRouter }         from './routes/stake';
import { chamaRouter }         from './routes/chama';
import { swapRouter }          from './routes/swap';
import { lendingRouter }       from './routes/lending';
import { rewardsRouter }       from './routes/rewards';
import { creditRouter }        from './routes/credit';
import { cardRouter }          from './routes/card';
import { pricelockRouter }     from './routes/pricelock';

import { startScheduler }      from './services/scheduler';

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

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  ts:     new Date().toISOString(),
  phase:  3,
}));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`OlomiPay API Phase 3 on :${PORT}`);
  startScheduler();
});

export default app;
