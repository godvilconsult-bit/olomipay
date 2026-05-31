import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { startScheduler }      from './services/scheduler';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet());
const allowedOrigins = [
  process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  'http://localhost:3000',
  'https://olomipay.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

// ── Routes ────────────────────────────────────────────────────────────────────
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

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`OlomiPay API on :${PORT}`);
  startScheduler();
});

export default app;
