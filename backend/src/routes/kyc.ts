import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── POST /api/kyc/submit ──────────────────────────────────────────────────────

router.post('/submit', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    idType:   z.enum(['NIDA', 'PASSPORT', 'VOTERS_ID', 'DRIVING_LICENSE']),
    idNumber: z.string().min(5).max(30),
    name:     z.string().min(2).max(100),
  }).safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.kycStatus === 'APPROVED') {
    return res.status(400).json({ error: 'KYC already approved' });
  }

  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      kycStatus:  'PENDING',
      kycIdType:  parse.data.idType,
      kycIdNumber: parse.data.idNumber,
      kycName:    parse.data.name,
    },
  });

  // In production: trigger ID verification via a KYC provider (e.g. Smile Identity)
  // For MVP: auto-approve after submission (remove this in production)
  if (process.env.NODE_ENV !== 'production') {
    await prisma.user.update({
      where: { id: req.userId! },
      data:  { kycStatus: 'APPROVED' },
    });
  }

  return res.json({
    message:   'KYC submitted successfully',
    kycStatus: process.env.NODE_ENV !== 'production' ? 'APPROVED' : 'PENDING',
  });
});

// ── GET /api/kyc/status ───────────────────────────────────────────────────────

router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { kycStatus: true, kycName: true, kycIdType: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    kycStatus: user.kycStatus,
    kycName:   user.kycName,
    kycIdType: user.kycIdType,
  });
});

export { router as kycRouter };
