import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── CORS — allow all vercel.app + localhost ───────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.endsWith('.vercel.app')) return cb(null, true);
    if (origin.includes('localhost')) return cb(null, true);
    if (origin === process.env.CORS_ORIGIN) return cb(null, true);
    if (origin === process.env.FRONTEND_URL) return cb(null, true);
    cb(null, true); // allow all for now
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  optionsSuccessStatus: 200,
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

// ── Health (load this first to confirm server is up) ──────────────────────────
app.get('/health', (_req, res) => res.json({
  status:  'ok',
  ts:      new Date().toISOString(),
  phase:   4,
  version: '4.2.0',
  build:   'chat+payments+gov',
}));

// ── Load routes safely ────────────────────────────────────────────────────────
async function loadRoutes() {
  try { const { authRouter }          = await import('./routes/auth');          app.use('/api/auth',          authRouter);          } catch(e: any) { console.error('[route] auth failed:', e.message); }
  try { const { walletRouter }        = await import('./routes/wallet');        app.use('/api/wallet',        walletRouter);        } catch(e: any) { console.error('[route] wallet failed:', e.message); }
  try { const { mpesaRouter }         = await import('./routes/mpesa');         app.use('/api/mpesa',         mpesaRouter);         } catch(e: any) { console.error('[route] mpesa failed:', e.message); }
  try { const { sendRouter }          = await import('./routes/send');          app.use('/api/send',          sendRouter);          } catch(e: any) { console.error('[route] send failed:', e.message); }
  try { const { kycRouter }           = await import('./routes/kyc');           app.use('/api/kyc',           kycRouter);           } catch(e: any) { console.error('[route] kyc failed:', e.message); }
  try { const { adminRouter }         = await import('./routes/admin');         app.use('/api/admin',         adminRouter);         } catch(e: any) { console.error('[route] admin failed:', e.message); }
  try { const { savingsRouter }       = await import('./routes/savings');       app.use('/api/savings',       savingsRouter);       } catch(e: any) { console.error('[route] savings failed:', e.message); }
  try { const { billsRouter }         = await import('./routes/bills');         app.use('/api/bills',         billsRouter);         } catch(e: any) { console.error('[route] bills failed:', e.message); }
  try { const { contactsRouter }      = await import('./routes/contacts');      app.use('/api/contacts',      contactsRouter);      } catch(e: any) { console.error('[route] contacts failed:', e.message); }
  try { const { scheduleRouter }      = await import('./routes/schedule');      app.use('/api/schedule',      scheduleRouter);      } catch(e: any) { console.error('[route] schedule failed:', e.message); }
  try { const { withdrawRouter }      = await import('./routes/withdraw');      app.use('/api/withdraw',      withdrawRouter);      } catch(e: any) { console.error('[route] withdraw failed:', e.message); }
  try { const { notificationsRouter } = await import('./routes/notifications'); app.use('/api/notifications', notificationsRouter); } catch(e: any) { console.error('[route] notifications failed:', e.message); }
  try { const { stakeRouter }         = await import('./routes/stake');         app.use('/api/stake',         stakeRouter);         } catch(e: any) { console.error('[route] stake failed:', e.message); }
  try { const { chamaRouter }         = await import('./routes/chama');         app.use('/api/chama',         chamaRouter);         } catch(e: any) { console.error('[route] chama failed:', e.message); }
  try { const { swapRouter }          = await import('./routes/swap');          app.use('/api/swap',          swapRouter);          } catch(e: any) { console.error('[route] swap failed:', e.message); }
  try { const { lendingRouter }       = await import('./routes/lending');       app.use('/api/lending',       lendingRouter);       } catch(e: any) { console.error('[route] lending failed:', e.message); }
  try { const { rewardsRouter }       = await import('./routes/rewards');       app.use('/api/rewards',       rewardsRouter);       } catch(e: any) { console.error('[route] rewards failed:', e.message); }
  try { const { creditRouter }        = await import('./routes/credit');        app.use('/api/credit',        creditRouter);        } catch(e: any) { console.error('[route] credit failed:', e.message); }
  try { const { cardRouter }          = await import('./routes/card');          app.use('/api/card',          cardRouter);          } catch(e: any) { console.error('[route] card failed:', e.message); }
  try { const { pricelockRouter }     = await import('./routes/pricelock');     app.use('/api/pricelock',     pricelockRouter);     } catch(e: any) { console.error('[route] pricelock failed:', e.message); }
  try { const { merchantRouter }      = await import('./routes/merchant');      app.use('/api/merchant',      merchantRouter);      } catch(e: any) { console.error('[route] merchant failed:', e.message); }
  try { const { payrollRouter }       = await import('./routes/payroll');       app.use('/api/payroll',       payrollRouter);       } catch(e: any) { console.error('[route] payroll failed:', e.message); }
  try { const { govRouter }           = await import('./routes/gov');           app.use('/api/gov',           govRouter);           } catch(e: any) { console.error('[route] gov failed:', e.message); }
  try { const { bondsRouter }         = await import('./routes/bonds');         app.use('/api/bonds',         bondsRouter);         } catch(e: any) { console.error('[route] bonds failed:', e.message); }
  try { const { developerRouter }     = await import('./routes/developer');     app.use('/api/developer',     developerRouter);     } catch(e: any) { console.error('[route] developer failed:', e.message); }
  try { const { chatRouter }          = await import('./routes/chat');          app.use('/api/chat',          chatRouter);          } catch(e: any) { console.error('[route] chat failed:', e.message); }
  try { const { mediaRouter }         = await import('./routes/media');         app.use('/api/chat/media',    mediaRouter);         } catch(e: any) { console.error('[route] media failed:', e.message); }
  try { const { inviteRouter }        = await import('./routes/invite');        app.use('/api/invite',        inviteRouter);        } catch(e: any) { console.error('[route] invite failed:', e.message); }
  try { const { profileRouter }       = await import('./routes/profile');       app.use('/api/profile',       profileRouter);       } catch(e: any) { console.error('[route] profile failed:', e.message); }
  console.log('[routes] All routes loaded');
}

// ── Debug: list all users (remove in production) ─────────────────────────────
app.get('/debug/users', async (_req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    const users = await p.user.findMany({
      select: { id: true, phone: true, kycName: true, kycStatus: true, stellarPubKey: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ count: users.length, users });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Check wallet balance for any address
app.get('/debug/wallet/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (r.status === 404) return res.json({ funded: false, address, balances: [] });
    const data = await r.json();
    const balances = data.balances?.map((b: any) => ({
      asset: b.asset_type === 'native' ? 'XLM' : b.asset_code,
      balance: b.balance,
    }));
    return res.json({ funded: true, address, balances });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Setup DB endpoint ─────────────────────────────────────────────────────────
app.get('/setup-db', async (_req, res) => {
  try {
    const { execSync } = await import('child_process');
    const output = execSync('npx prisma db push --accept-data-loss', {
      cwd: '/app', encoding: 'utf8', timeout: 120_000,
    });
    return res.json({ success: true, output });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const httpServer = createServer(app);

httpServer.listen(PORT, async () => {
  console.log(`Tuma API v4.2.0 on :${PORT}`);
  await loadRoutes();

  // Socket.io
  try {
    const { initSocket } = await import('./socket');
    initSocket(httpServer);
    console.log('[socket] initialized');
  } catch(e: any) { console.error('[socket] failed:', e.message); }

  // DB setup
  try {
    const { setupDatabase } = await import('./services/dbSetup');
    await setupDatabase();
  } catch(e: any) { console.error('[db]', e.message); }

  // Scheduler
  try {
    const { startScheduler } = await import('./services/scheduler');
    startScheduler();
  } catch(e: any) { console.error('[scheduler]', e.message); }
});

export default app;
