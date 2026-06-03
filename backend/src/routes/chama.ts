import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer, platformSendUsdc, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { sendSms } from '../services/sms';
import { notify } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();
const limiter = rateLimit({ windowMs: 60_000, max: 10, message: { success: false, error: 'Too many requests' } });
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── POST /api/chama/create ────────────────────────────────────────────────────
router.post('/create', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:             z.string().min(2).max(50),
    contributionUsdc: z.number().positive().max(10_000),
    memberPhones:     z.array(z.string().regex(/^\+255\d{9}$/)).min(1).max(19),
    frequencyDays:    z.union([z.literal(7), z.literal(14), z.literal(30)]),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { name, contributionUsdc, memberPhones, frequencyDays } = parse.data;

  // Resolve phones to user IDs
  const members = await prisma.user.findMany({
    where:  { phone: { in: memberPhones } },
    select: { id: true, phone: true },
  });

  const chama = await prisma.chama.create({
    data: {
      name,
      adminId:          req.userId!,
      contributionUsdc,
      frequencyDays,
      nextDueAt:        new Date(Date.now() + frequencyDays * 86_400_000),
      members: {
        create: [
          { userId: req.userId!, position: 0 },
          ...members.map((m, i) => ({ userId: m.id, position: i + 1 })),
        ],
      },
    },
    include: { members: { include: { user: { select: { phone: true } } } } },
  });

  // Notify/SMS non-registered phones
  const registeredPhones = new Set(members.map(m => m.phone));
  for (const phone of memberPhones) {
    if (!registeredPhones.has(phone)) {
      await sendSms(phone,
        `You've been invited to join "${name}" chama on OlomiPay. ` +
        `Contribute ${contributionUsdc} USDC ${frequencyDays === 30 ? 'monthly' : `every ${frequencyDays} days`}. ` +
        `Join here: ${process.env.FRONTEND_URL}/auth/register`
      );
    }
  }

  return res.status(201).json(ok({ chama, message: 'Chama created successfully' }));
});

// ── GET /api/chama/list ───────────────────────────────────────────────────────
router.get('/list', requireAuth, async (req: AuthRequest, res) => {
  const chamas = await prisma.chama.findMany({
    where: { members: { some: { userId: req.userId! } } },
    include: {
      members: { include: { user: { select: { phone: true, stellarPubKey: true } } } },
      admin:   { select: { phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(ok({ chamas }));
});

// ── GET /api/chama/:id ────────────────────────────────────────────────────────
// BOLA-safe: only the chama admin or a member may view it (members include phones).
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const chama = await prisma.chama.findUnique({
    where: { id: req.params.id },
    include: {
      members: { include: { user: { select: { id: true, phone: true } } }, orderBy: { position: 'asc' } },
      admin:   { select: { phone: true } },
    },
  });
  if (!chama) return res.status(404).json(fail('Chama not found'));

  // Object-level authorization — requester must be the admin or a member.
  const isMember = chama.adminId === req.userId
    || chama.members.some(m => m.userId === req.userId);
  if (!isMember) return res.status(404).json(fail('Chama not found')); // 404 (not 403) prevents ID enumeration

  return res.json(ok({ chama }));
});

// ── POST /api/chama/contribute ────────────────────────────────────────────────
router.post('/contribute', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    chamaId: z.string(),
    pin:     z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  const validPin = await verifyPin(parse.data.pin, user.pinHash);
  if (!validPin) return res.status(403).json(fail('Incorrect PIN'));

  const chama = await prisma.chama.findUnique({
    where:   { id: parse.data.chamaId },
    include: { members: true },
  });
  if (!chama) return res.status(404).json(fail('Chama not found'));
  if (chama.status !== 'ACTIVE' && chama.status !== 'FORMING') {
    return res.status(400).json(fail('Chama is not accepting contributions'));
  }

  const member = chama.members.find(m => m.userId === req.userId);
  if (!member) return res.status(403).json(fail('Not a member of this chama'));

  const bal = await getBalance(user.stellarPubKey);
  if (parseFloat(bal.usdc) < chama.contributionUsdc) {
    return res.status(400).json(fail('Insufficient USDC balance'));
  }

  try {
    const hash = await contractTransfer({
      fromEncryptedSecret: user.stellarSecret,
      fromPin:   parse.data.pin,
      fromPhone: user.phone,
      fromPublicKey: user.stellarPubKey,
      toPublicKey:   process.env.FEE_ACCOUNT!,
      amountUsdc:    chama.contributionUsdc,
      memo:          `Chama: ${chama.name} R${chama.currentRound}`,
    });

    // Update chama status to active after first contribution
    if (chama.status === 'FORMING') {
      await prisma.chama.update({ where: { id: chama.id }, data: { status: 'ACTIVE' } });
    }

    // Notify other members
    const otherMembers = chama.members.filter(m => m.userId !== req.userId);
    for (const m of otherMembers) {
      await notify.moneySent(m.userId, `$${chama.contributionUsdc} USDC`, `${chama.name} chama`);
    }

    // Check if all members contributed → trigger payout
    await checkAndPayout(chama.id);

    return res.json(ok({ message: 'Contribution successful', hash }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message));
  }
});

// ── POST /api/chama/:id/remind ────────────────────────────────────────────────
router.post('/:id/remind', requireAuth, async (req: AuthRequest, res) => {
  const chama = await prisma.chama.findUnique({
    where:   { id: req.params.id },
    include: { members: { include: { user: { select: { phone: true } } } } },
  });
  if (!chama || chama.adminId !== req.userId) return res.status(403).json(fail('Not the admin'));

  for (const member of chama.members) {
    await sendSms(
      member.user.phone,
      `Kumbusho: Michango ya chama "${chama.name}" inahitajika. Lipa $${chama.contributionUsdc} USDC kwenye OlomiPay.`
    );
  }
  return res.json(ok({ message: 'Reminders sent' }));
});

// ── Helper: auto-payout when all contributed ─────────────────────────────────
async function checkAndPayout(chamaId: string) {
  const chama = await prisma.chama.findUnique({
    where:   { id: chamaId },
    include: { members: { include: { user: true }, orderBy: { position: 'asc' } } },
  });
  if (!chama || chama.status !== 'ACTIVE') return;

  // TODO: Track per-round contributions in DB — simplified here
  // In production, check all members contributed this round before payout
}

export { router as chamaRouter };
