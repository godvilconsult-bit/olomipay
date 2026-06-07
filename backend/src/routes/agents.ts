/**
 * Agent / cash network — the human ATM layer. Local agents (shops, kiosks)
 * turn physical cash into OlomiPay balance and back, so people without a bank
 * or smartphone-only flow can still get in and out. This is how cash economies
 * actually onboard — M-Pesa's real moat.
 *
 * Money moves on-chain between real wallets (no fabricated balances):
 *   • CASH-IN  — customer hands the agent cash; the agent's wallet sends USDC
 *                to the customer (agent-initiated, agent PIN).
 *   • CASH-OUT — customer requests cash; on confirm their wallet sends USDC to
 *                the agent (customer PIN); the agent then hands over cash.
 * Agents earn a tracked commission on every completed transaction.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireRole } from '../services/adminAuth';
import { contractTransfer, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';
import { getRate } from '../services/yellowcard';
import { checkTierLimit } from '../services/kycTiers';

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 10, message: { success: false, error: 'Too many requests' } });
const ok   = (data: any) => ({ success: true, data });
const fail = (msg: string) => ({ success: false, error: msg });

const COUNTRY_CCY: Record<string, string> = {
  TZ: 'TZS', KE: 'KES', UG: 'UGX', GH: 'GHS', ZM: 'ZMW', NG: 'NGN', RW: 'RWF', SN: 'XOF',
};

const CASHOUT_CODE_TTL_MS = 10 * 60 * 1000; // pending cash-out codes expire in 10 minutes

// Sum of an agent's COMPLETED volume (cash-in + cash-out) since midnight UTC.
async function agentVolumeToday(agentId: string): Promise<number> {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.agentTransaction.aggregate({
    where: { agentId, status: 'COMPLETED', createdAt: { gte: start } },
    _sum: { amountUsdc: true },
  }).catch(() => ({ _sum: { amountUsdc: 0 } } as any));
  return agg._sum.amountUsdc ?? 0;
}

// Per-transaction + daily-volume guard for an agent. Returns an error string or null.
async function checkAgentLimits(agent: any, amountUsdc: number): Promise<string | null> {
  if (amountUsdc > agent.perTxLimitUsdc) {
    return `Amount exceeds the per-transaction limit of $${agent.perTxLimitUsdc.toFixed(2)}`;
  }
  const today = await agentVolumeToday(agent.id);
  if (today + amountUsdc > agent.dailyLimitUsdc) {
    const left = Math.max(0, agent.dailyLimitUsdc - today);
    return `This exceeds the agent's daily limit. Remaining today: $${left.toFixed(2)}`;
  }
  return null;
}

async function localFor(amountUsdc: number, country: string): Promise<{ local: number; currency: string }> {
  const currency = COUNTRY_CCY[country] ?? 'TZS';
  try {
    const rate = await getRate(currency);
    return { local: Math.round(amountUsdc * rate.usdSellRate), currency };
  } catch { return { local: 0, currency }; }
}

const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

// ── GET /api/agents/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { userId: req.userId! } });
    return res.json(ok({ agent }));
  } catch (e: any) {
    // e.g. table not yet created on a fresh deploy — treat as "not an agent"
    // so the page still loads instead of hanging on a thrown async error.
    console.warn('[agents/me] lookup failed (returning null):', e.message);
    return res.json(ok({ agent: null }));
  }
});

// ── POST /api/agents/apply ────────────────────────────────────────────────────
router.post('/apply', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    businessName: z.string().trim().min(2).max(80),
    city:         z.string().trim().min(2).max(60),
    country:      z.string().length(2).optional(),
    phone:        z.string().min(6).max(20),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const applicant = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!applicant) return res.status(404).json(fail('User not found'));
  if (applicant.kycStatus !== 'APPROVED') {
    return res.status(403).json(fail('Complete identity verification (KYC) before applying to be an agent'));
  }

  const existing = await prisma.agent.findUnique({ where: { userId: req.userId! } });
  if (existing) return res.status(400).json(fail('You already have an agent application'));

  const country = (parse.data.country ?? 'TZ').toUpperCase();
  // Unique short code, e.g. AGT-TZ-4821
  let code = '';
  for (let i = 0; i < 6; i++) {
    code = `AGT-${country}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await prisma.agent.findUnique({ where: { code } }))) break;
  }

  const agent = await prisma.agent.create({ data: {
    userId: req.userId!, code, businessName: parse.data.businessName,
    city: parse.data.city, country, phone: parse.data.phone, status: 'pending',
  }});
  return res.json(ok({ agent, message: 'Application submitted. Our team will review it shortly.' }));
});

// ── GET /api/agents/directory?country=TZ&city= ────────────────────────────────
router.get('/directory', requireAuth, async (req: AuthRequest, res) => {
  const country = String(req.query.country ?? 'TZ').toUpperCase();
  const city = req.query.city ? String(req.query.city) : undefined;
  const agents = await prisma.agent.findMany({
    where: { status: 'active', country, ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}) },
    select: { id: true, code: true, businessName: true, city: true, country: true, phone: true },
    take: 100,
  });
  return res.json(ok({ agents }));
});

// ── POST /api/agents/cash-in ──────────────────────────────────────────────────
// Agent gives a customer digital balance after receiving their cash.
router.post('/cash-in', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    customerPhone: z.string().min(6).max(20),
    amountUsdc:    z.number().positive().max(10_000),
    pin:           z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const agent = await prisma.agent.findUnique({ where: { userId: req.userId! } });
  if (!agent || agent.status !== 'active') return res.status(403).json(fail('You are not an active agent'));

  const limitErr = await checkAgentLimits(agent, parse.data.amountUsdc);
  if (limitErr) return res.status(400).json(fail(limitErr));

  const agentUser = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!agentUser) return res.status(404).json(fail('Agent account not found'));
  if (!(await verifyPin(parse.data.pin, agentUser.pinHash))) return res.status(403).json(fail('Incorrect PIN'));

  const customer = await prisma.user.findFirst({ where: { phone: parse.data.customerPhone.replace(/^\+/, '') } })
    ?? await prisma.user.findFirst({ where: { phone: parse.data.customerPhone } });
  if (!customer) return res.status(404).json(fail('Customer not found — they must have an OlomiPay account'));
  if (customer.id === agent.userId) return res.status(400).json(fail('Cannot cash-in to yourself'));

  const bal = await getBalance(agentUser.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) {
    return res.status(400).json(fail('Your float is too low for this cash-in'));
  }

  const { local, currency } = await localFor(parse.data.amountUsdc, agent.country);
  const commission = parse.data.amountUsdc * (agent.commissionPct / 100);

  try {
    const hash = await contractTransfer({
      fromEncryptedSecret: agentUser.stellarSecret,
      fromPin:   parse.data.pin,
      fromPhone: agentUser.phone,
      fromPublicKey: agentUser.stellarPubKey,
      toPublicKey:   customer.stellarPubKey,
      amountUsdc:    parse.data.amountUsdc,
      memo:          'Agent cash-in',
    });

    await prisma.agentTransaction.create({ data: {
      agentId: agent.id, userId: customer.id, type: 'CASH_IN', status: 'COMPLETED',
      amountUsdc: parse.data.amountUsdc, localAmount: local, currency,
      stellarTxId: hash, commissionUsdc: commission,
    }});
    await prisma.agent.update({ where: { id: agent.id }, data: { commissionEarned: { increment: commission } } });
    await prisma.transaction.create({ data: {
      userId: customer.id, type: 'DEPOSIT', status: 'CONFIRMED',
      amountUsdc: parse.data.amountUsdc, stellarTxId: hash, memo: `Cash-in via agent ${agent.code}`,
    }});
    await notify.moneyReceived(customer.id, `$${parse.data.amountUsdc.toFixed(2)}`, agent.businessName).catch(() => {});

    return res.json(ok({ message: 'Cash-in complete', amountUsdc: parse.data.amountUsdc, local, currency, commission: +commission.toFixed(4) }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Cash-in failed'));
  }
});

// ── POST /api/agents/cash-out/request ─────────────────────────────────────────
// Customer starts a cash-out at an agent; returns a code to show the agent.
router.post('/cash-out/request', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    agentCode:  z.string().min(3),
    amountUsdc: z.number().positive().max(10_000),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const agent = await prisma.agent.findUnique({ where: { code: parse.data.agentCode.toUpperCase() } });
  if (!agent || agent.status !== 'active') return res.status(404).json(fail('Agent not found or inactive'));
  if (agent.userId === req.userId!) return res.status(400).json(fail('Cannot cash-out to yourself'));

  const limitErr = await checkAgentLimits(agent, parse.data.amountUsdc);
  if (limitErr) return res.status(400).json(fail(limitErr));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < parse.data.amountUsdc) return res.status(400).json(fail('Insufficient balance'));

  // Replace any earlier still-pending cash-out for this user (avoid stacking codes).
  await prisma.agentTransaction.updateMany({
    where: { userId: req.userId!, type: 'CASH_OUT', status: 'PENDING' },
    data:  { status: 'EXPIRED', code: null },
  }).catch(() => {});

  const { local, currency } = await localFor(parse.data.amountUsdc, agent.country);
  const code = genCode();
  const expiresAt = new Date(Date.now() + CASHOUT_CODE_TTL_MS);
  const tx = await prisma.agentTransaction.create({ data: {
    agentId: agent.id, userId: req.userId!, type: 'CASH_OUT', status: 'PENDING',
    amountUsdc: parse.data.amountUsdc, localAmount: local, currency, code, expiresAt,
  }});
  return res.json(ok({
    transactionId: tx.id, code, agent: agent.businessName,
    amountUsdc: parse.data.amountUsdc, local, currency, expiresAt,
    message: `Show code ${code} to the agent, then confirm with your PIN within 10 minutes to release the money.`,
  }));
});

// ── POST /api/agents/cash-out/confirm ─────────────────────────────────────────
// Customer confirms with PIN → USDC moves to the agent; agent disburses cash.
router.post('/cash-out/confirm', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    transactionId: z.string().min(1),
    pin:           z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const tx = await prisma.agentTransaction.findFirst({
    where: { id: parse.data.transactionId, userId: req.userId!, type: 'CASH_OUT', status: 'PENDING' },
  });
  if (!tx) return res.status(404).json(fail('Cash-out request not found'));
  if (tx.expiresAt && tx.expiresAt.getTime() < Date.now()) {
    await prisma.agentTransaction.update({ where: { id: tx.id }, data: { status: 'EXPIRED', code: null } }).catch(() => {});
    return res.status(410).json(fail('This cash-out code has expired. Please start again.'));
  }

  const agent = await prisma.agent.findUnique({ where: { id: tx.agentId } });
  if (!agent || agent.status !== 'active') return res.status(404).json(fail('Agent unavailable'));

  const limitErr = await checkAgentLimits(agent, tx.amountUsdc);
  if (limitErr) return res.status(400).json(fail(limitErr));

  // Customer-side compliance tier limit.
  const lim = await checkTierLimit(req.userId!, tx.amountUsdc, 'agent_cashout');
  if (!lim.ok) return res.status(403).json(fail(lim.error!));

  const agentUser = await prisma.user.findUnique({ where: { id: agent.userId } });
  if (!agentUser) return res.status(404).json(fail('Agent account not found'));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!(await verifyPin(parse.data.pin, user.pinHash))) return res.status(403).json(fail('Incorrect PIN'));

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < tx.amountUsdc) return res.status(400).json(fail('Insufficient balance'));

  const commission = tx.amountUsdc * (agent.commissionPct / 100);
  try {
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:   parse.data.pin,
      fromPhone: user.phone,
      fromPublicKey: user.stellarPubKey,
      toPublicKey:   agentUser.stellarPubKey,
      amountUsdc:    tx.amountUsdc,
      memo:          'Agent cash-out',
    });
    await prisma.agentTransaction.update({ where: { id: tx.id },
      data: { status: 'COMPLETED', stellarTxId: hash, commissionUsdc: commission, code: null } });
    await prisma.agent.update({ where: { id: agent.id }, data: { commissionEarned: { increment: commission } } });
    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'WITHDRAWAL', status: 'CONFIRMED',
      amountUsdc: tx.amountUsdc, stellarTxId: hash, memo: `Cash-out via agent ${agent.code}`,
    }});
    await notify.moneyReceived(agent.userId, `$${tx.amountUsdc.toFixed(2)}`, 'Cash-out customer').catch(() => {});

    return res.json(ok({ message: 'Confirmed — collect your cash from the agent.', local: tx.localAmount, currency: tx.currency }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message ?? 'Cash-out failed'));
  }
});

// ── GET /api/agents/transactions (agent's own ledger) ─────────────────────────
router.get('/transactions', requireAuth, async (req: AuthRequest, res) => {
  const agent = await prisma.agent.findUnique({ where: { userId: req.userId! } });
  if (!agent) return res.status(403).json(fail('Not an agent'));
  const txs = await prisma.agentTransaction.findMany({
    where: { agentId: agent.id }, orderBy: { createdAt: 'desc' }, take: 50,
  });
  return res.json(ok({ agent, transactions: txs }));
});

// ── Admin: list + approve/suspend agents (Support head or super-admin) ────────
router.get('/admin/list', requireRole('SUPPORT_HEAD', 'SUPER_ADMIN'), async (_req, res) => {
  const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  return res.json(ok({ agents }));
});

router.post('/admin/:id/status', requireRole('SUPPORT_HEAD', 'SUPER_ADMIN'), async (req, res) => {
  const parse = z.object({ status: z.enum(['active', 'suspended', 'pending']) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail('Invalid status'));
  const agent = await prisma.agent.update({ where: { id: req.params.id }, data: { status: parse.data.status } }).catch(() => null);
  if (!agent) return res.status(404).json(fail('Agent not found'));
  return res.json(ok({ agent }));
});

// Admin: adjust an agent's per-transaction and daily limits.
router.post('/admin/:id/limits', requireRole('SUPPORT_HEAD', 'SUPER_ADMIN'), async (req, res) => {
  const parse = z.object({
    perTxLimitUsdc: z.number().min(0).max(100_000).optional(),
    dailyLimitUsdc: z.number().min(0).max(1_000_000).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));
  const agent = await prisma.agent.update({
    where: { id: req.params.id },
    data:  { perTxLimitUsdc: parse.data.perTxLimitUsdc, dailyLimitUsdc: parse.data.dailyLimitUsdc },
  }).catch(() => null);
  if (!agent) return res.status(404).json(fail('Agent not found'));
  return res.json(ok({ agent }));
});

export { router as agentsRouter };
