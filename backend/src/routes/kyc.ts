import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';

const router = Router();

const IMG = z.string().min(20).max(3_000_000); // data URL or hosted URL

// ── POST /api/kyc/submit ─ selfie + ID document + details ─────────────────────────
router.post('/submit', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:     z.string().min(2).max(100),
    idType:   z.enum(['NIDA', 'PASSPORT', 'LICENSE', 'VOTER']),
    idNumber: z.string().min(4).max(40),
    selfieUrl: IMG,
    idUrl:     IMG,
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { name, idType, idNumber, selfieUrl, idUrl } = parse.data;

  const user = await prisma.user.update({
    where: { id: req.userId },
    data:  {
      kycName: name, kycIdType: idType, kycIdNumber: idNumber,
      kycSelfieUrl: selfieUrl, kycIdUrl: idUrl,
      kycStatus: 'SUBMITTED',
      profilePicUrl: selfieUrl, // the verified selfie becomes the public photo
      ...(name && { name }),
    },
  });

  // Tell the admins there's a new KYC to review.
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, { title: 'New KYC submission 🪪', body: `${name} (${user.role}) submitted KYC for review.`, type: 'kyc', data: { userId: user.id } })));

  res.json({ ok: true, kycStatus: user.kycStatus });
});

// ── GET /api/kyc/status ───────────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { kycStatus: true, kycName: true, kycIdType: true, kycIdNumber: true } });
  res.json({ ...u, submitted: u?.kycStatus === 'SUBMITTED' || u?.kycStatus === 'APPROVED' });
});

export { router as kycRouter };
