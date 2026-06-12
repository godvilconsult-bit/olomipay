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
    // Riders: vehicle details captured during KYC
    plateNo:     z.string().max(20).optional(),
    vehicleType: z.enum(['MOTORBIKE', 'BAJAJI', 'CAR', 'TRUCK', 'BICYCLE']).optional(),
    // Suppliers: business + mobile-wallet payment details (shown to households)
    businessName: z.string().max(120).optional(),
    description:  z.string().max(500).optional(),
    payProvider:  z.string().max(40).optional(),
    payNumber:    z.string().max(30).optional(),
    payName:      z.string().max(120).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { name, idType, idNumber, selfieUrl, idUrl, plateNo, vehicleType, businessName, description, payProvider, payNumber, payName } = parse.data;

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

  // Riders: store vehicle type + registration/plate on their profile.
  if (user.role === 'RIDER' && (plateNo || vehicleType)) {
    await prisma.riderProfile.updateMany({
      where: { userId: user.id },
      data:  { ...(plateNo && { plateNo }), ...(vehicleType && { vehicleType: vehicleType as any }) },
    }).catch(() => {});
  }

  // Suppliers: store business + mobile-wallet payment details so households see
  // who they're buying from and how to pay.
  if (user.role === 'SUPPLIER') {
    await prisma.supplierProfile.updateMany({
      where: { userId: user.id },
      data:  {
        ...(businessName && { businessName }),
        ...(description  !== undefined && { description }),
        ...(payProvider  !== undefined && { payProvider }),
        ...(payNumber    !== undefined && { payNumber }),
        ...(payName      !== undefined && { payName }),
      },
    }).catch(() => {});
  }

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
