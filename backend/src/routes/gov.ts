import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { platformSendUsdc, generateKeypair } from '../services/stellar';
import { sendSms } from '../services/sms';

const router = Router();
const prisma = new PrismaClient();
const limiter = rateLimit({ windowMs: 60_000, max: 5, message: { success: false, error: 'Rate limited' } });
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── POST /api/gov/program/create ──────────────────────────────────────────────
router.post('/program/create', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:        z.string().min(2).max(200),
    description: z.string().optional(),
    budgetUsdc:  z.number().positive(),
    startDate:   z.string(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const program = await prisma.govProgram.create({
    data: {
      businessId:  req.userId!,
      name:        parse.data.name,
      description: parse.data.description,
      budgetUsdc:  parse.data.budgetUsdc,
      startDate:   new Date(parse.data.startDate),
    },
  });

  return res.status(201).json(ok({ program }));
});

// ── POST /api/gov/beneficiaries/upload ────────────────────────────────────────
router.post('/beneficiaries/upload', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    programId:     z.string(),
    beneficiaries: z.array(z.object({
      nationalId: z.string(),
      fullName:   z.string(),
      phone:      z.string(),
      amountUsdc: z.number().positive(),
      ward:       z.string().optional(),
      district:   z.string().optional(),
    })).min(1).max(10_000),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const program = await prisma.govProgram.findUnique({ where: { id: parse.data.programId } });
  if (!program || program.businessId !== req.userId) {
    return res.status(404).json(fail('Program not found'));
  }

  const created = await prisma.govBeneficiary.createMany({
    data: parse.data.beneficiaries.map(b => ({
      programId:  parse.data.programId,
      nationalId: b.nationalId,
      fullName:   b.fullName,
      phone:      b.phone,
      amountUsdc: b.amountUsdc,
      ward:       b.ward,
      district:   b.district,
      reference:  `GOV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    })),
    skipDuplicates: true,
  });

  return res.status(201).json(ok({
    count:   created.count,
    message: `${created.count} beneficiaries uploaded`,
  }));
});

// ── POST /api/gov/disburse ────────────────────────────────────────────────────
router.post('/disburse', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    programId:  z.string(),
    batchSize:  z.number().int().min(1).max(500).default(100),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const program = await prisma.govProgram.findUnique({ where: { id: parse.data.programId } });
  if (!program || program.businessId !== req.userId) {
    return res.status(404).json(fail('Program not found'));
  }

  const pending = await prisma.govBeneficiary.findMany({
    where:  { programId: parse.data.programId, status: 'PENDING' },
    take:   parse.data.batchSize,
  });

  if (pending.length === 0) {
    return res.json(ok({ message: 'All beneficiaries already disbursed', disbursed: 0 }));
  }

  let successCount = 0;

  for (const beneficiary of pending) {
    try {
      // Find or auto-create Tuma account for beneficiary
      let user = await prisma.user.findFirst({ where: { phone: beneficiary.phone } });

      if (!user) {
        // Auto-create account for new beneficiary
        const { publicKey, secretKey } = generateKeypair();
        const tempPin = Math.floor(100000 + Math.random() * 900000).toString();
        const { hashPin } = await import('../services/crypto');
        const pinHash = await hashPin(tempPin);

        user = await prisma.user.create({
          data: {
            phone:         beneficiary.phone,
            pinHash,
            stellarPubKey: publicKey,
            stellarSecret: secretKey,
            kycName:       beneficiary.fullName,
            kycStatus:     'APPROVED',
          },
        });
      }

      const hash = await platformSendUsdc(
        user.stellarPubKey,
        beneficiary.amountUsdc,
        `GOV:${beneficiary.reference}`,
      );

      await prisma.govBeneficiary.update({
        where: { id: beneficiary.id },
        data:  { status: 'CONFIRMED', stellarTxId: hash, disbursedAt: new Date() },
      });

      await prisma.govProgram.update({
        where: { id: parse.data.programId },
        data:  { disbursed: { increment: beneficiary.amountUsdc } },
      });

      // SMS notification in Swahili
      const amountTzs = Math.round(beneficiary.amountUsdc * 2600);
      await sendSms(
        beneficiary.phone,
        `Msaada wa serikali wa TZS ${amountTzs.toLocaleString()} (Ref: ${beneficiary.reference}) umepokelewa kwenye akaunti yako ya Tuma. Tembelea ${process.env.FRONTEND_URL}`
      );

      successCount++;
    } catch (e: any) {
      await prisma.govBeneficiary.update({
        where: { id: beneficiary.id },
        data:  { status: 'FAILED' },
      });
    }
  }

  return res.json(ok({
    disbursed:   successCount,
    failed:      pending.length - successCount,
    total:       pending.length,
    message:     `Disbursed to ${successCount}/${pending.length} beneficiaries`,
  }));
});

// ── GET /api/gov/program/:id/report ──────────────────────────────────────────
router.get('/program/:id/report', requireAuth, async (req: AuthRequest, res) => {
  const program = await prisma.govProgram.findUnique({
    where:   { id: req.params.id },
    include: { beneficiaries: { orderBy: { disbursedAt: 'desc' } } },
  });
  if (!program || program.businessId !== req.userId) {
    return res.status(404).json(fail('Program not found'));
  }

  const stats = {
    total:      program.beneficiaries.length,
    disbursed:  program.beneficiaries.filter(b => b.status === 'CONFIRMED').length,
    pending:    program.beneficiaries.filter(b => b.status === 'PENDING').length,
    failed:     program.beneficiaries.filter(b => b.status === 'FAILED').length,
    totalUsdc:  program.budgetUsdc,
    disbursedUsdc: program.disbursed,
  };

  return res.json(ok({ program, beneficiaries: program.beneficiaries, stats }));
});

// ── GET /api/gov/program/:id/stats ────────────────────────────────────────────
router.get('/program/:id/stats', requireAuth, async (req: AuthRequest, res) => {
  const program = await prisma.govProgram.findUnique({ where: { id: req.params.id } });
  if (!program || program.businessId !== req.userId) {
    return res.status(404).json(fail('Not found'));
  }

  const [total, disbursed, pending, failed] = await Promise.all([
    prisma.govBeneficiary.count({ where: { programId: req.params.id } }),
    prisma.govBeneficiary.count({ where: { programId: req.params.id, status: 'CONFIRMED' } }),
    prisma.govBeneficiary.count({ where: { programId: req.params.id, status: 'PENDING' } }),
    prisma.govBeneficiary.count({ where: { programId: req.params.id, status: 'FAILED' } }),
  ]);

  return res.json(ok({
    total, disbursed, pending, failed,
    disbursedPct: total > 0 ? Math.round((disbursed / total) * 100) : 0,
    budgetUsdc:   program.budgetUsdc,
    disbursedUsdc: program.disbursed,
    remainingUsdc: program.budgetUsdc - program.disbursed,
  }));
});

export { router as govRouter };
