import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPin, verifyPin } from '../lib/pin';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Tanzanian MSISDN → +255XXXXXXXXX
function normalizePhone(v: string): string {
  const clean = v.replace(/\s+/g, '');
  if (clean.startsWith('0'))  return '+255' + clean.slice(1);
  if (clean.startsWith('255')) return '+' + clean;
  if (!clean.startsWith('+')) return '+255' + clean;
  return clean;
}

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  message: { error: 'Too many attempts, try again in a minute' },
});

function signAccess(userId: string, phone: string, role: Role): string {
  return jwt.sign({ userId, phone, role }, process.env.JWT_SECRET!, { expiresIn: '7d' });
}
function signRefresh(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '180d' });
}
async function storeRefresh(userId: string, token: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + 180 * 864e5) },
  });
}

async function publicUser(userId: string) {
  return prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id: true, phone: true, role: true, name: true, region: true,
      kycStatus: true, profilePicUrl: true, isAdmin: true, createdAt: true,
      supplierProfile: { select: { id: true, businessName: true, isOpen: true, isVerified: true, tier: true } },
      riderProfile:    { select: { id: true, vehicleType: true, plateNo: true, status: true, isVerified: true, rating: true, totalDeliveries: true } },
      distributorProfile: { select: { id: true, businessName: true, region: true, isVerified: true, isActive: true } },
      brandProfile: { select: { id: true, brandName: true, isVerified: true } },
    },
  });
}

// ── POST /api/auth/register ─────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const parse = z.object({
    phone:        z.string().min(7).max(20).transform(normalizePhone),
    pin:          z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
    role:         z.enum(['HOUSEHOLD', 'SUPPLIER', 'RIDER', 'DISTRIBUTOR', 'BRAND']).default('HOUSEHOLD'),
    name:         z.string().min(1).max(100).optional(),
    region:       z.string().max(60).optional(),
    businessName: z.string().max(120).optional(),
    vehicleType:  z.enum(['MOTORBIKE', 'BAJAJI', 'CAR', 'TRUCK', 'BICYCLE']).optional(),
    lat:          z.number().optional(),
    lng:          z.number().optional(),
    referralCode: z.string().max(20).optional(),
  }).safeParse(req.body);

  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { phone, pin, role, name, region, businessName, vehicleType, lat, lng } = parse.data;
  const hasLoc = typeof lat === 'number' && typeof lng === 'number';

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return res.status(409).json({ error: 'Phone number already registered' });

  const user = await prisma.user.create({
    data: {
      phone,
      pinHash: hashPin(pin),
      role: role as Role,
      name: name ?? null,
      region: region ?? null,
      // Provision the role profile up-front so suppliers/riders are usable.
      ...(role === 'HOUSEHOLD' && hasLoc && {
        addresses: { create: { label: 'Home', lat: lat!, lng: lng!, region: region ?? 'Dar es Salaam', isDefault: true } },
      }),
      ...(role === 'SUPPLIER' && {
        supplierProfile: { create: { businessName: businessName ?? (name ?? 'My Gas Shop'), phone, region: region ?? 'Dar es Salaam', ...(hasLoc && { lat: lat!, lng: lng! }) } },
      }),
      ...(role === 'RIDER' && {
        riderProfile: { create: { region: region ?? 'Dar es Salaam', vehicleType: (vehicleType ?? 'MOTORBIKE') as any, ...(hasLoc && { currentLat: lat!, currentLng: lng! }) } },
      }),
      ...(role === 'DISTRIBUTOR' && {
        distributorProfile: { create: { businessName: businessName ?? (name ?? 'My Depot'), phone, region: region ?? 'Dar es Salaam', ...(hasLoc && { lat: lat!, lng: lng! }) } },
      }),
      ...(role === 'BRAND' && {
        brandProfile: { create: { brandName: businessName ?? (name ?? 'My Brand'), contactName: name ?? null, phone } },
      }),
    },
  });

  // Link a referral if a valid invite code was supplied (rewarded on first completed order).
  if (parse.data.referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: parse.data.referralCode.toUpperCase() }, select: { id: true } });
    if (referrer && referrer.id !== user.id) {
      await prisma.user.update({ where: { id: user.id }, data: { referredById: referrer.id } }).catch(() => {});
      await prisma.referral.create({ data: { referrerId: referrer.id, refereeId: user.id } }).catch(() => {});
    }
  }

  const accessToken  = signAccess(user.id, phone, user.role);
  const refreshToken = signRefresh(user.id);
  await storeRefresh(user.id, refreshToken);

  return res.status(201).json({ accessToken, refreshToken, user: await publicUser(user.id) });
});

// ── POST /api/auth/login ────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const parse = z.object({
    phone: z.string().min(7).max(20).transform(normalizePhone),
    pin:   z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const { phone, pin } = parse.data;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    await verifyPin('0000', '$2b$12$invalidhashpadding000000000000000000000000000000000000');
    return res.status(401).json({ error: 'Invalid phone or PIN' });
  }

  const MAX_ATTEMPTS = 5, LOCK_MIN = 30;
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return res.status(423).json({ error: `Account locked. Try again in ${mins} minute(s).`, locked: true });
  }

  if (!(await verifyPin(pin, user.pinHash))) {
    const count = user.failedLoginCount + 1;
    if (count >= MAX_ATTEMPTS) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000) } });
      return res.status(423).json({ error: `Too many attempts. Locked for ${LOCK_MIN} minutes.`, locked: true });
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: count } });
    return res.status(401).json({ error: `Invalid phone or PIN. ${MAX_ATTEMPTS - count} attempt(s) left.` });
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  const accessToken  = signAccess(user.id, phone, user.role);
  const refreshToken = signRefresh(user.id);
  await storeRefresh(user.id, refreshToken);

  return res.json({ accessToken, refreshToken, user: await publicUser(user.id) });
});

// ── POST /api/auth/refresh ──────────────────────────────────────────────────────
router.post('/refresh', authLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: string; type: string };
    if (payload.type !== 'refresh') throw new Error('bad type');

    const hash   = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.expiresAt < new Date()) return res.status(401).json({ error: 'Refresh token expired' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const newAccess  = signAccess(user.id, user.phone, user.role);
    const newRefresh = signRefresh(user.id);
    await prisma.refreshToken.delete({ where: { tokenHash: hash } });
    await storeRefresh(user.id, newRefresh);

    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const user = await publicUser(req.userId!);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user });
});

// ── POST /api/auth/logout ───────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
  }
  return res.json({ message: 'Logged out' });
});

export { router as authRouter };
