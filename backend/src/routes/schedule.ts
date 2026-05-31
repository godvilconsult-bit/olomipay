import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const createSchema = z.object({
  toAddress: z.string().optional(),
  toPhone:   z.string().regex(/^\+255\d{9}$/).optional(),
  toName:    z.string().max(50).optional(),
  amount:    z.number().positive().max(10_000),
  asset:     z.enum(['USDC', 'XLM']).default('USDC'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  startDate: z.string().datetime(),
  endDate:   z.string().datetime().optional(),
  memo:      z.string().max(50).optional(),
}).refine(d => d.toAddress || d.toPhone, {
  message: 'Either toAddress or toPhone is required',
});

// ── POST /api/schedule/create ─────────────────────────────────────────────────

router.post('/create', requireAuth, async (req: AuthRequest, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const d = parse.data;
  let toAddress = d.toAddress;

  // Resolve phone → Stellar address
  if (!toAddress && d.toPhone) {
    const recipient = await prisma.user.findUnique({
      where:  { phone: d.toPhone },
      select: { stellarPubKey: true },
    });
    if (!recipient) {
      return res.status(404).json(fail(
        `No OlomiPay account for ${d.toPhone}. Ask them to register first.`
      ));
    }
    toAddress = recipient.stellarPubKey;
  }

  const schedule = await prisma.scheduledPayment.create({ data: {
    userId:    req.userId!,
    toAddress: toAddress!,
    toPhone:   d.toPhone,
    toName:    d.toName,
    amount:    d.amount,
    asset:     d.asset,
    frequency: d.frequency as any,
    nextRunAt: new Date(d.startDate),
    endDate:   d.endDate ? new Date(d.endDate) : undefined,
    memo:      d.memo,
  }});

  return res.status(201).json(ok({ schedule, message: 'Scheduled payment created' }));
});

// ── GET /api/schedule/list ────────────────────────────────────────────────────

router.get('/list', requireAuth, async (req: AuthRequest, res) => {
  const schedules = await prisma.scheduledPayment.findMany({
    where:   { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(ok({ schedules }));
});

// ── PUT /api/schedule/:id ─────────────────────────────────────────────────────

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  const schedule = await prisma.scheduledPayment.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!schedule) return res.status(404).json(fail('Schedule not found'));

  const parse = z.object({
    amount:   z.number().positive().optional(),
    memo:     z.string().max(50).optional(),
    isActive: z.boolean().optional(),
    endDate:  z.string().datetime().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const updated = await prisma.scheduledPayment.update({
    where: { id: req.params.id },
    data:  {
      amount:  parse.data.amount,
      memo:    parse.data.memo,
      isActive: parse.data.isActive,
      endDate: parse.data.endDate ? new Date(parse.data.endDate) : undefined,
    },
  });

  return res.json(ok({ schedule: updated }));
});

// ── DELETE /api/schedule/:id ──────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const schedule = await prisma.scheduledPayment.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!schedule) return res.status(404).json(fail('Schedule not found'));

  await prisma.scheduledPayment.update({
    where: { id: req.params.id },
    data:  { isActive: false },
  });

  return res.json(ok({ message: 'Schedule cancelled' }));
});

export { router as scheduleRouter };
