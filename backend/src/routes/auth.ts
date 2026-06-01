import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { generateKeypair, createAndFundAccount } from '../services/stellar';
import { encryptSecret, hashPin, verifyPin } from '../services/crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router  = Router();
const prisma  = new PrismaClient();

// Tanzania phone number: +255 followed by 9 digits
const phoneSchema = z
  .string()
  .regex(/^\+255\d{9}$/, 'Phone must be in +255XXXXXXXXX format');

// 6-digit PIN
const pinSchema = z
  .string()
  .regex(/^\d{6}$/, 'PIN must be 6 digits');

// Strict rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { error: 'Too many auth attempts, try again in 1 minute' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function signAccessToken(userId: string, phone: string): string {
  return jwt.sign(
    { userId, phone },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  );
}

function signRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' },
  );
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const hash      = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: hash, expiresAt } });
}

// ── POST /api/auth/register ────────────────────────────────────────────────────

router.post('/register', authLimiter, async (req, res) => {
  const parse = z.object({
    phone: phoneSchema,
    pin:   pinSchema,
    name:  z.string().min(2).max(100).optional(),
  }).safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const { phone, pin, name } = parse.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: 'Phone number already registered' });
  }

  // Generate Stellar keypair
  const { publicKey, secretKey } = generateKeypair();
  const encryptedSecret          = encryptSecret(secretKey, pin, phone);
  const pinHash                  = hashPin(pin);

  // Generate chat keypair safely (don't crash registration if it fails)
  let chatPublicKey:    string | null = null;
  let chatSecretKeyEnc: string | null = null;
  try {
    const nacl       = require('tweetnacl');
    const { encodeBase64 } = require('tweetnacl-util');
    const chatKp     = nacl.box.keyPair();
    chatPublicKey    = encodeBase64(chatKp.publicKey);
    chatSecretKeyEnc = encryptSecret(encodeBase64(chatKp.secretKey), pin, phone);
  } catch (e: any) {
    console.warn('[auth] chat keygen skipped:', e.message);
  }

  // Build user data — only include fields that exist in DB
  const userData: any = {
    phone,
    pinHash,
    stellarPubKey: publicKey,
    stellarSecret: encryptedSecret,
  };
  if (chatPublicKey)    userData.chatPublicKey    = chatPublicKey;
  if (chatSecretKeyEnc) userData.chatSecretKeyEnc = chatSecretKeyEnc;
  if (name)             userData.kycName          = name;

  const user = await prisma.user.create({ data: userData });

  // Fund the account asynchronously (don't block registration)
  createAndFundAccount(publicKey).catch(err =>
    console.error('[stellar] failed to fund new account:', err),
  );

  const accessToken  = signAccessToken(user.id, phone);
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  return res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      id:           user.id,
      phone:        user.phone,
      stellarPubKey: user.stellarPubKey,
      kycStatus:    user.kycStatus,
    },
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', authLimiter, async (req, res) => {
  const parse = z.object({ phone: phoneSchema, pin: pinSchema }).safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message });
  }

  const { phone, pin } = parse.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    // Timing-safe: still run bcrypt even on miss
    await verifyPin('000000', '$2b$12$invalidhashpadding000000000000000000000000000000000000');
    return res.status(401).json({ error: 'Invalid phone or PIN' });
  }

  const valid = await verifyPin(pin, user.pinHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid phone or PIN' });
  }

  const accessToken  = signAccessToken(user.id, phone);
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  return res.json({
    accessToken,
    refreshToken,
    user: {
      id:           user.id,
      phone:        user.phone,
      stellarPubKey: user.stellarPubKey,
      kycStatus:    user.kycStatus,
    },
  });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────

router.post('/refresh', authLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
      userId: string;
      type: string;
    };
    if (payload.type !== 'refresh') throw new Error('wrong token type');

    const hash   = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token expired or revoked' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const newAccess  = signAccessToken(user.id, user.phone);
    const newRefresh = signRefreshToken(user.id);

    // Rotate refresh token
    await prisma.refreshToken.delete({ where: { tokenHash: hash } });
    await storeRefreshToken(user.id, newRefresh);

    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId },
    select: { id: true, phone: true, stellarPubKey: true, kycStatus: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
  }
  return res.json({ message: 'Logged out' });
});

export { router as authRouter };
