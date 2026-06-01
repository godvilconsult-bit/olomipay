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
