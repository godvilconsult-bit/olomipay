import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma  = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const FRONTEND = process.env.FRONTEND_URL ?? 'https://olomipay.vercel.app';

// ── GET /api/invite/link — generate personal invite link ─────────────────────
router.get('/link', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { id: true, kycName: true, phone: true },
  });
  if (!user) return res.status(404).json(fail('User not found'));

  const code  = Buffer.from(user.id).toString('base64url').slice(0, 12);
  const link  = `${FRONTEND}/join?ref=${code}&from=${encodeURIComponent(user.kycName ?? user.phone.slice(0,8)+'...')}`;
  const text  = `Jiunge nami kwenye Tuma — tumia akaunti ya pamoja kutuma pesa, kuzungumza na kufanya biashara.\n\nBonyeza hapa: ${link}`;

  return res.json(ok({ link, shareText: text, inviterName: user.kycName ?? user.phone }));
});

// ── GET /api/invite/check/:phone — check if phone is registered ───────────────
router.get('/check/:phone', requireAuth, async (req: AuthRequest, res) => {
  const phone = decodeURIComponent(req.params.phone);
  const user  = await prisma.user.findUnique({
    where:  { phone },
    select: { id: true, kycName: true, chatPublicKey: true, isOnline: true },
  });
  return res.json(ok({ registered: !!user, user: user ?? null }));
});

// ── POST /api/invite/match-contacts — bulk match phone numbers ────────────────
// Send array of phone numbers, get back which ones are registered on Tuma
router.post('/match-contacts', requireAuth, async (req: AuthRequest, res) => {
  const { phones } = req.body as { phones: string[] };
  if (!Array.isArray(phones) || phones.length === 0) {
    return res.json(ok({ matches: [] }));
  }

  // Normalize all phone numbers
  const normalize = (p: string) => {
    const clean = p.replace(/[\s\-().+]/g, '');
    if (clean.startsWith('0') && clean.length === 10) return '+255' + clean.slice(1);
    if (clean.startsWith('255') && clean.length === 12) return '+' + clean;
    if (clean.startsWith('7') && clean.length === 9) return '+255' + clean;
    return '+' + clean;
  };

  const normalized = [...new Set(phones.map(normalize))].slice(0, 500);

  const users = await prisma.user.findMany({
    where:  { phone: { in: normalized }, id: { not: req.userId! } },
    select: { id: true, phone: true, kycName: true, chatPublicKey: true, isOnline: true, lastSeenAt: true },
  });

  // Return map of normalized phone → user
  const matches = users.map(u => ({
    id:           u.id,
    phone:        u.phone,
    kycName:      u.kycName,
    chatPublicKey: u.chatPublicKey,
    isOnline:     u.isOnline ?? false,
    lastSeenAt:   u.lastSeenAt,
  }));

  return res.json(ok({ matches }));
});

// ── GET /api/invite/resolve/:code — resolve invite code to inviter info ───────
router.get('/resolve/:code', async (req, res) => {
  try {
    const userId = Buffer.from(req.params.code, 'base64url').toString();
    const user   = await prisma.user.findUnique({
      where:  { id: userId },
      select: { kycName: true, phone: true },
    });
    if (!user) return res.status(404).json(fail('Invalid invite link'));
    return res.json(ok({
      inviterName: user.kycName ?? user.phone.slice(0, 5) + '****' + user.phone.slice(-4),
    }));
  } catch {
    return res.status(400).json(fail('Invalid invite code'));
  }
});

export { router as inviteRouter };
