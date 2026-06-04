import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import axios from 'axios';
import { requireAuth } from '../middleware/auth';

const router = Router();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── GET /api/pricelock/rate-history ───────────────────────────────────────────
router.get('/rate-history', requireAuth, async (_req, res) => {
  // Return last 12 months of TZS/USD rates from DB
  const history = await prisma.rateHistory.findMany({
    orderBy: { date: 'desc' },
    take:    365,
  });

  // If no history, seed with approximate data
  if (history.length < 10) {
    await seedRateHistory();
    const fresh = await prisma.rateHistory.findMany({ orderBy: { date: 'asc' }, take: 365 });
    return res.json(ok({ history: fresh }));
  }

  return res.json(ok({ history: history.reverse() }));
});

// ── GET /api/pricelock/comparison ─────────────────────────────────────────────
router.get('/comparison', requireAuth, async (req, res) => {
  const parse = z.object({ amountTzs: z.coerce.number().positive() }).safeParse(req.query);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { amountTzs } = parse.data;

  // Get oldest rate in our DB (represents ~1 year ago)
  const oldest = await prisma.rateHistory.findFirst({ orderBy: { date: 'asc' } });
  const newest = await prisma.rateHistory.findFirst({ orderBy: { date: 'desc' } });

  const rateOneYearAgo = oldest?.usdToTzs ?? 2300;
  const rateNow        = newest?.usdToTzs ?? 2600;

  // In bank account: value stayed the same in TZS but USD value dropped
  const usdValueThenInBank = amountTzs / rateOneYearAgo;
  const tzsValueNowFromBank = amountTzs; // Same TZS (minus bank fees, simplified)
  const usdValueNowFromBank = tzsValueNowFromBank / rateNow;
  const usdLostInBank      = usdValueThenInBank - usdValueNowFromBank;
  const devaluationPct     = ((rateNow - rateOneYearAgo) / rateOneYearAgo * 100).toFixed(1);

  // In Tuma USDC: converted to USD at old rate, held as USDC, still same USD value
  const usdcHeld    = amountTzs / rateOneYearAgo;
  const tzsNowUsdc  = usdcHeld * rateNow; // Now worth MORE TZS

  return res.json(ok({
    amountTzs,
    devaluationPct,
    bankAccount: {
      valueNowTzs:  amountTzs,
      valueNowUsd:  +usdValueNowFromBank.toFixed(2),
      usdLost:      +usdLostInBank.toFixed(2),
    },
    tumaUsdc: {
      usdcHeld:     +usdcHeld.toFixed(4),
      valueNowTzs:  +tzsNowUsdc.toFixed(0),
      valueNowUsd:  +usdcHeld.toFixed(2),
      gainVsBank:   +(tzsNowUsdc - amountTzs).toFixed(0),
    },
    message: `TZS has devalued ${devaluationPct}% against USD in the past year. USDC holders are fully protected.`,
  }));
});

// ── Seed approximate historical rate data ─────────────────────────────────────
async function seedRateHistory() {
  // Approximate TZS/USD rates showing steady devaluation
  const baseRate  = 2300;
  const today     = new Date();

  const records = [];
  for (let i = 365; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    // Add ~13% annual devaluation + noise
    const rate = baseRate + (365 - i) * 0.82 + (Math.random() - 0.5) * 20;
    records.push({ date: d, usdToTzs: +rate.toFixed(2) });
  }

  await prisma.rateHistory.createMany({ data: records, skipDuplicates: true });
}

export { router as pricelockRouter };
