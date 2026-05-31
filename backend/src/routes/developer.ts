import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── POST /api/developer/webhooks/register ─────────────────────────────────────
router.post('/webhooks/register', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    url:    z.string().url(),
    events: z.array(z.enum(['payment.completed', 'payment.failed', 'deposit.confirmed', 'withdrawal.completed'])),
    secret: z.string().min(16),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  // Find or use userId as businessId for now
  const webhook = await prisma.webhook.create({
    data: {
      businessId: req.userId!,
      url:        parse.data.url,
      events:     parse.data.events,
      secret:     parse.data.secret,
    },
  });

  return res.status(201).json(ok({ webhook, message: 'Webhook registered. HMAC-SHA256 signature included in X-Tuma-Signature header.' }));
});

// ── GET /api/developer/webhooks ────────────────────────────────────────────────
router.get('/webhooks', requireAuth, async (req: AuthRequest, res) => {
  const webhooks = await prisma.webhook.findMany({
    where: { businessId: req.userId! },
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
  });
  return res.json(ok({ webhooks }));
});

// ── POST /api/developer/webhooks/test ─────────────────────────────────────────
router.post('/webhooks/test', requireAuth, async (req: AuthRequest, res) => {
  const { webhookId } = req.body;
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.businessId !== req.userId) return res.status(404).json(fail('Webhook not found'));

  const payload = JSON.stringify({
    event:     'payment.completed',
    timestamp: new Date().toISOString(),
    data:      { amount: 1.00, currency: 'USDC', test: true },
  });

  const sig = crypto.createHmac('sha256', webhook.secret).update(payload).digest('hex');

  try {
    const { default: axios } = await import('axios');
    await axios.post(webhook.url, JSON.parse(payload), {
      headers: { 'X-Tuma-Signature': `sha256=${sig}`, 'Content-Type': 'application/json' },
      timeout: 10_000,
    });
    return res.json(ok({ message: 'Test payload delivered successfully' }));
  } catch (e: any) {
    return res.status(502).json(fail(`Webhook delivery failed: ${e.message}`));
  }
});

// ── GET /api/developer/usage ───────────────────────────────────────────────────
router.get('/usage', requireAuth, async (req: AuthRequest, res) => {
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const [txCount, successCount] = await Promise.all([
    prisma.transaction.count({ where: { userId: req.userId!, createdAt: { gte: month } } }),
    prisma.transaction.count({ where: { userId: req.userId!, createdAt: { gte: month }, status: 'CONFIRMED' } }),
  ]);

  return res.json(ok({
    thisMonth:   { requests: txCount, successful: successCount, successRate: txCount > 0 ? Math.round((successCount / txCount) * 100) : 100 },
    plan:        'STARTER',
    limit:       10_000,
    apiDocsUrl:  `${process.env.FRONTEND_URL}/docs`,
  }));
});

// ── POST /api/developer/keys/generate ─────────────────────────────────────────
router.post('/keys/generate', requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body;
  const rawKey  = `tuma_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  await prisma.devApiKey.create({
    data: { userId: req.userId!, name: name ?? 'My API Key', keyHash },
  });

  return res.status(201).json(ok({
    key:     rawKey,
    message: 'Save this key — it will not be shown again.',
  }));
});

// ── Helper: fire webhooks for a user ─────────────────────────────────────────
export async function fireWebhooks(userId: string, event: string, data: any): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { businessId: userId, isActive: true, events: { has: event } },
  });

  for (const webhook of webhooks) {
    const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
    const sig     = crypto.createHmac('sha256', webhook.secret).update(payload).digest('hex');
    try {
      const { default: axios } = await import('axios');
      await axios.post(webhook.url, JSON.parse(payload), {
        headers: { 'X-Tuma-Signature': `sha256=${sig}` },
        timeout: 10_000,
      }).catch(() => {}); // Non-blocking
    } catch {}
  }
}

export { router as developerRouter };
