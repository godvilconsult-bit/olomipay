/**
 * Smart Money Insights — turns a user's transaction history into plain-language
 * understanding + actionable suggestions. No crypto jargon; the "advanced
 * financial tools" made accessible to everyone.
 *
 * Read-only. Never moves money.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const ok = (data: any) => ({ success: true, data });

const IN_TYPES  = ['DEPOSIT', 'RECEIVE'];
const OUT_TYPES = ['SEND', 'WITHDRAWAL', 'FEE', 'BILL', 'PAYMENT'];

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const txs = await prisma.transaction.findMany({
    where:   { userId, status: 'CONFIRMED', createdAt: { gte: startLast } },
    orderBy: { createdAt: 'desc' },
    take:    3000,
  }).catch(() => [] as any[]);

  const sum = (list: any[], types: string[]) =>
    list.filter(t => types.includes(t.type)).reduce((s, t) => s + (t.amountUsdc ?? 0), 0);

  const thisM = txs.filter(t => new Date(t.createdAt) >= startThis);
  const lastM = txs.filter(t => new Date(t.createdAt) >= startLast && new Date(t.createdAt) < startThis);

  const inThis  = sum(thisM, IN_TYPES);
  const outThis = sum(thisM, OUT_TYPES);
  const inLast  = sum(lastM, IN_TYPES);
  const outLast = sum(lastM, OUT_TYPES);
  const netThis = inThis - outThis;
  const savingsRate = inThis > 0 ? Math.max(0, netThis / inThis) : 0;

  // Spending breakdown by type (this month, outflows only)
  const byType: Record<string, number> = {};
  for (const t of thisM) {
    if (OUT_TYPES.includes(t.type)) byType[t.type] = (byType[t.type] ?? 0) + (t.amountUsdc ?? 0);
  }
  const breakdown = Object.entries(byType)
    .map(([type, amount]) => ({ type, amount: Number(amount.toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount);

  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));

  // Rule-based, friendly suggestions (the "AI analysis", lightweight + safe)
  const tips: { icon: string; title: string; body: string }[] = [];
  if (inThis > 0 && savingsRate < 0.1) {
    const target = inThis * 0.1;
    tips.push({ icon: '🎯', title: 'Save 10% automatically',
      body: `You've kept ${(savingsRate * 100).toFixed(0)}% of what came in. Saving just $${target.toFixed(2)} this month builds a real cushion — move it to Savings and earn while it sits.` });
  }
  if (netThis > 5) {
    tips.push({ icon: '🌱', title: 'Put idle money to work',
      body: `You have about $${netThis.toFixed(2)} left over. In Savings it earns interest every second — withdraw anytime.` });
  }
  if (outThis > inThis && inThis > 0) {
    tips.push({ icon: '⚠️', title: 'Spending more than you received',
      body: `This month you spent $${outThis.toFixed(2)} but received $${inThis.toFixed(2)}. Watch your largest outflows below.` });
  }
  if (breakdown[0]) {
    tips.push({ icon: '📊', title: `Biggest outflow: ${breakdown[0].type.toLowerCase()}`,
      body: `$${breakdown[0].amount.toFixed(2)} went to ${breakdown[0].type.toLowerCase()} this month.` });
  }
  if (tips.length === 0) {
    tips.push({ icon: '👋', title: 'Start your money story',
      body: 'Add money and make a few payments — your personalised insights and savings tips will appear here.' });
  }

  return res.json(ok({
    month: now.toLocaleString('en', { month: 'long', year: 'numeric' }),
    moneyIn:  Number(inThis.toFixed(2)),
    moneyOut: Number(outThis.toFixed(2)),
    net:      Number(netThis.toFixed(2)),
    savingsRatePct: Math.round(savingsRate * 100),
    vsLastMonth: { inChangePct: pct(inThis, inLast), outChangePct: pct(outThis, outLast) },
    breakdown,
    tips,
    txCount: thisM.length,
  }));
});

export { router as insightsRouter };
