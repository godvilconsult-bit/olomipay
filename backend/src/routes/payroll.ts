import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { platformSendUsdc, getBalance } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { notify } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();
const limiter = rateLimit({ windowMs: 60_000, max: 5, message: { success: false, error: 'Too many requests' } });
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── POST /api/payroll/upload ──────────────────────────────────────────────────
// Accepts JSON array (frontend parses CSV before sending)
router.post('/upload', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    recipients: z.array(z.object({
      name:       z.string(),
      phone:      z.string().optional(),
      address:    z.string().optional(),
      amountUsdc: z.number().positive(),
      department: z.string().optional(),
      reference:  z.string().optional(),
    })).min(1).max(100),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { recipients } = parse.data;
  const total = recipients.reduce((sum, r) => sum + r.amountUsdc, 0);
  const fee   = total * 0.005; // 0.5% batch fee

  // Preview — don't execute yet
  const payrollRun = await prisma.payrollRun.create({
    data: {
      businessId:     req.userId!,
      totalAmount:    total,
      recipientCount: recipients.length,
      status:         'PENDING',
      recipients: {
        create: recipients.map(r => ({
          name:       r.name,
          phone:      r.phone,
          address:    r.address,
          amountUsdc: r.amountUsdc,
          department: r.department,
          reference:  r.reference,
          status:     'PENDING',
        })),
      },
    },
    include: { recipients: true },
  });

  return res.status(201).json(ok({
    batchId:     payrollRun.id,
    total,
    fee,
    netTotal:    total + fee,
    count:       recipients.length,
    recipients:  payrollRun.recipients,
    message:     'Preview ready. Call /execute to disburse.',
  }));
});

// ── POST /api/payroll/execute ─────────────────────────────────────────────────
router.post('/execute', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    batchId: z.string(),
    pin:     z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));
  if (!await verifyPin(parse.data.pin, user.pinHash)) return res.status(403).json(fail('Incorrect PIN'));

  const payrollRun = await prisma.payrollRun.findUnique({
    where:   { id: parse.data.batchId },
    include: { recipients: true },
  });
  if (!payrollRun || payrollRun.businessId !== req.userId) {
    return res.status(404).json(fail('Batch not found'));
  }
  if (payrollRun.status !== 'PENDING') {
    return res.status(400).json(fail('Batch already executed'));
  }

  const bal = await getBalance(user.stellarPubKey);
  const required = payrollRun.totalAmount * 1.005;
  if (parseFloat(bal.usdc) < required) {
    return res.status(400).json(fail(`Insufficient balance. Need ${required.toFixed(2)} USDC`));
  }

  // Execute transfers
  const results: { id: string; status: string; hash?: string }[] = [];
  let successCount = 0;

  await prisma.payrollRun.update({ where: { id: payrollRun.id }, data: { status: 'CONFIRMED' } });

  for (const recipient of payrollRun.recipients) {
    try {
      // Resolve phone to address or use direct address
      let toAddress = recipient.address;
      if (!toAddress && recipient.phone) {
        const found = await prisma.user.findUnique({
          where:  { phone: recipient.phone },
          select: { stellarPubKey: true },
        });
        toAddress = found?.stellarPubKey ?? null;
      }

      if (!toAddress) {
        await prisma.payrollRecipient.update({
          where: { id: recipient.id },
          data:  { status: 'FAILED' },
        });
        results.push({ id: recipient.id, status: 'FAILED' });
        continue;
      }

      const hash = await platformSendUsdc(toAddress, recipient.amountUsdc, `Payroll: ${recipient.reference ?? recipient.name}`);

      await prisma.payrollRecipient.update({
        where: { id: recipient.id },
        data:  { status: 'CONFIRMED', stellarTxId: hash },
      });
      results.push({ id: recipient.id, status: 'CONFIRMED', hash });
      successCount++;

      // Notify recipient if they're a Tuma user
      if (recipient.phone) {
        const tumaUser = await prisma.user.findUnique({ where: { phone: recipient.phone } });
        if (tumaUser) {
          await notify.moneyReceived(tumaUser.id, `$${recipient.amountUsdc}`, 'Payroll');
        }
      }
    } catch (e: any) {
      await prisma.payrollRecipient.update({
        where: { id: recipient.id },
        data:  { status: 'FAILED' },
      });
      results.push({ id: recipient.id, status: 'FAILED' });
    }
  }

  await prisma.payrollRun.update({
    where: { id: payrollRun.id },
    data:  { executedAt: new Date() },
  });

  return res.json(ok({
    batchId:      payrollRun.id,
    successCount,
    failedCount:  payrollRun.recipients.length - successCount,
    results,
    message:      `Payroll executed: ${successCount}/${payrollRun.recipients.length} successful`,
  }));
});

// ── GET /api/payroll/history ──────────────────────────────────────────────────
router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  const runs = await prisma.payrollRun.findMany({
    where:   { businessId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take:    20,
    include: { _count: { select: { recipients: true } } },
  });
  return res.json(ok({ runs }));
});

// ── GET /api/payroll/batch/:id ────────────────────────────────────────────────
router.get('/batch/:id', requireAuth, async (req: AuthRequest, res) => {
  const run = await prisma.payrollRun.findUnique({
    where:   { id: req.params.id },
    include: { recipients: true },
  });
  if (!run || run.businessId !== req.userId) return res.status(404).json(fail('Not found'));
  return res.json(ok({ run }));
});

export { router as payrollRouter };
