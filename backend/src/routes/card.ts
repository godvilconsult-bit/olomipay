import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import axios from 'axios';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';

const router = Router();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// Mock card issuer (replace with Sudo Africa / Union54 in production)
function mockIssueCard(userId: string) {
  const rand = () => Math.floor(1000 + Math.random() * 9000);
  return {
    cardRef:      `CARD-${userId.slice(0, 8).toUpperCase()}`,
    maskedNumber: `4242 **** **** ${rand()}`,
    fullNumber:   `4242 ${rand()} ${rand()} ${rand()}`, // Never store this
    expiryMonth:  12,
    expiryYear:   new Date().getFullYear() + 3,
    cvv:          String(Math.floor(100 + Math.random() * 900)), // Never store this
  };
}

// ── POST /api/card/issue ──────────────────────────────────────────────────────
router.post('/issue', requireAuth, async (req: AuthRequest, res) => {
  const { pin } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (user.kycStatus !== 'APPROVED') {
    return res.status(403).json(fail('KYC required to issue a virtual card'));
  }
  if (!await verifyPin(pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const existing = await prisma.virtualCard.findUnique({ where: { userId: req.userId! } });
  if (existing) return res.status(400).json(fail('You already have a virtual card'));

  const cardData = mockIssueCard(req.userId!);

  await prisma.virtualCard.create({
    data: {
      userId:       req.userId!,
      cardRef:      cardData.cardRef,
      maskedNumber: cardData.maskedNumber,
      expiryMonth:  cardData.expiryMonth,
      expiryYear:   cardData.expiryYear,
    },
  });

  // Return sensitive data ONCE — never stored
  return res.status(201).json(ok({
    maskedNumber: cardData.maskedNumber,
    expiryMonth:  cardData.expiryMonth,
    expiryYear:   cardData.expiryYear,
    message:      'Virtual card issued! Save your card details.',
  }));
});

// ── GET /api/card/details ─────────────────────────────────────────────────────
router.get('/details', requireAuth, async (req: AuthRequest, res) => {
  const card = await prisma.virtualCard.findUnique({ where: { userId: req.userId! } });
  if (!card) return res.status(404).json(fail('No virtual card found. Issue one first.'));

  return res.json(ok({
    maskedNumber: card.maskedNumber,
    expiryMonth:  card.expiryMonth,
    expiryYear:   card.expiryYear,
    status:       card.status,
    dailyLimit:   card.dailyLimit,
  }));
});

// ── POST /api/card/freeze ─────────────────────────────────────────────────────
router.post('/freeze', requireAuth, async (req: AuthRequest, res) => {
  await prisma.virtualCard.update({
    where: { userId: req.userId! },
    data:  { status: 'frozen' },
  });
  return res.json(ok({ message: 'Card frozen. No transactions will be processed.' }));
});

// ── POST /api/card/unfreeze ───────────────────────────────────────────────────
router.post('/unfreeze', requireAuth, async (req: AuthRequest, res) => {
  await prisma.virtualCard.update({
    where: { userId: req.userId! },
    data:  { status: 'active' },
  });
  return res.json(ok({ message: 'Card unfrozen.' }));
});

// ── PUT /api/card/limits ──────────────────────────────────────────────────────
router.put('/limits', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    dailyLimitUsdc: z.number().positive().max(10_000).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  await prisma.virtualCard.update({
    where: { userId: req.userId! },
    data:  { dailyLimit: parse.data.dailyLimitUsdc },
  });
  return res.json(ok({ message: 'Card limits updated' }));
});

// ── POST /api/card/webhook ────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const { userId, amount, merchant } = req.body;
  if (userId && amount && merchant) {
    await notify.moneySent(userId, `$${amount}`, merchant);
  }
});

export { router as cardRouter };
