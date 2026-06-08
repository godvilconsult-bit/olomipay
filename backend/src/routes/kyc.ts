import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { TIERS, tierFor, checkTierLimit } from '../services/kycTiers';
import { requireRole } from '../services/adminAuth';

const router = Router();

// KYC documents are SENSITIVE (government IDs). They are stored in a PRIVATE
// object-storage key (never a public URL) and only streamed back to authorised
// compliance staff. Falls back to base64-in-DB when object storage isn't set.
const KYC_KINDS = ['ID_FRONT', 'ID_BACK', 'SELFIE'] as const;
const COMPLIANCE_ROLES = ['SUPPORT_HEAD', 'FINANCE_HEAD', 'SUPER_ADMIN'];

const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.mimetype)),
});

const r2 = process.env.R2_ACCOUNT_ID
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;
const KYC_BUCKET = process.env.R2_KYC_BUCKET ?? process.env.R2_BUCKET_NAME;

// Compliance access trail: record which staff member viewed which user's
// identity documents (and when/from where). Best-effort, never blocks.
async function auditKycAccess(req: any, action: string, targetUserId: string, detail?: any) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminAuditLog" ("adminId","adminPhone","action","targetId","targetType","detail","ip")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      req.userId ?? null, req.adminPhone ?? null, action, targetUserId, 'kyc_document',
      detail ? JSON.stringify(detail).slice(0, 1000) : null,
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? null,
    );
  } catch { /* never block */ }
}

// ── POST /api/kyc/document ────────────────────────────────────────────────────
// Upload one KYC document (kind = ID_FRONT | ID_BACK | SELFIE). Replaces any
// previous file of the same kind for this user. Marks KYC as SUBMITTED.
router.post('/document', requireAuth, kycUpload.single('file'), async (req: AuthRequest, res) => {
  const kind = String(req.body?.kind ?? '').toUpperCase();
  if (!KYC_KINDS.includes(kind as any)) return res.status(400).json({ error: 'Invalid document kind' });
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const mimeType = req.file.mimetype;
  let storageKey: string | null = null;
  let dataUrl:    string | null = null;

  try {
    if (r2 && KYC_BUCKET) {
      storageKey = `kyc/${req.userId}/${kind}-${crypto.randomBytes(8).toString('hex')}`;
      await r2.send(new PutObjectCommand({ Bucket: KYC_BUCKET, Key: storageKey, Body: req.file.buffer, ContentType: mimeType }));
    } else {
      // No object storage configured → keep private in DB (admin-only retrieval).
      dataUrl = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;
    }
  } catch (e: any) {
    return res.status(502).json({ error: 'Upload failed' });
  }

  // One row per (user, kind) — replace older one.
  await prisma.kycDocument.deleteMany({ where: { userId: req.userId!, kind } }).catch(() => {});
  await prisma.kycDocument.create({ data: { userId: req.userId!, kind, storageKey, dataUrl, mimeType } });
  await prisma.user.update({ where: { id: req.userId! }, data: { kycStatus: 'SUBMITTED' } }).catch(() => {});

  return res.json({ success: true });
});

// ── GET /api/kyc/admin/:userId/documents ─────────────────────────────────────
// Compliance staff: list a user's KYC details + document metadata (not the bytes).
router.get('/admin/:userId/documents', requireRole(...COMPLIANCE_ROLES), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, phone: true, accountNo: true, kycStatus: true, kycLevel: true, kycName: true, kycIdType: true, kycIdNumber: true },
  }).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const docs = await prisma.kycDocument.findMany({
    where: { userId: req.params.userId },
    select: { id: true, kind: true, mimeType: true, uploadedAt: true },
    orderBy: { uploadedAt: 'desc' },
  }).catch(() => []);

  return res.json({ success: true, data: { user, documents: docs } });
});

// ── GET /api/kyc/admin/document/:docId ───────────────────────────────────────
// Compliance staff: stream the actual document bytes (for review / handing to
// authorities during a dispute). Authenticated; never a public URL.
router.get('/admin/document/:docId', requireRole(...COMPLIANCE_ROLES), async (req, res) => {
  const doc = await prisma.kycDocument.findUnique({ where: { id: req.params.docId } }).catch(() => null);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  // Record the access (who viewed which user's ID doc) before streaming it.
  await auditKycAccess(req, 'kyc_document_viewed', doc.userId, { docId: doc.id, kind: doc.kind });

  try {
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    if (doc.storageKey && r2 && KYC_BUCKET) {
      const obj = await r2.send(new GetObjectCommand({ Bucket: KYC_BUCKET, Key: doc.storageKey }));
      (obj.Body as any).pipe(res);
      return;
    }
    if (doc.dataUrl) {
      const b64 = doc.dataUrl.split(',')[1] ?? '';
      return res.end(Buffer.from(b64, 'base64'));
    }
    return res.status(404).json({ error: 'No file' });
  } catch (e: any) {
    return res.status(502).json({ error: 'Could not load document' });
  }
});

// ── POST /api/kyc/admin/:userId/level ─────────────────────────────────────────
// Compliance/super-admin sets a user's KYC level (approve to Verified=2, grant
// Enhanced=3, or downgrade). Setting level >=2 also marks kycStatus APPROVED.
router.post('/admin/:userId/level', requireRole('SUPPORT_HEAD', 'FINANCE_HEAD', 'SUPER_ADMIN'), async (req, res) => {
  const parse = z.object({ level: z.number().int().min(0).max(3) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'level must be 0-3' });

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data:  {
      kycLevel:  parse.data.level,
      kycStatus: parse.data.level >= 2 ? 'APPROVED' : undefined,
    },
  }).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ message: `KYC level set to ${parse.data.level}`, level: parse.data.level });
});

// ── GET /api/kyc/tier ─────────────────────────────────────────────────────────
// Current level, its limits, today's/this-month's usage, and all tiers (for an
// in-app "Limits & verification" screen).
router.get('/tier', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! }, select: { kycLevel: true, kycStatus: true, kycName: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Use the limit checker purely to read back current usage (amount 0, never blocks).
  const usage = await checkTierLimit(req.userId!, 0, 'send');
  const tier  = tierFor(user.kycLevel ?? 0);

  return res.json({
    level:      user.kycLevel ?? 0,
    label:      tier.label,
    kycStatus:  user.kycStatus,
    limits:     { perTxUsdc: tier.perTxUsdc, dailyUsdc: tier.dailyUsdc, monthlyUsdc: tier.monthlyUsdc },
    features:   tier.features,
    usedToday:  usage.usedToday,
    usedMonth:  usage.usedMonth,
    upgradeHint: tier.upgradeHint,
    allTiers:   Object.values(TIERS).map(t => ({
      level: t.level, label: t.label,
      perTxUsdc: t.perTxUsdc, dailyUsdc: t.dailyUsdc, monthlyUsdc: t.monthlyUsdc,
      features: t.features,
    })),
  });
});

// ── POST /api/kyc/basic ───────────────────────────────────────────────────────
// Lightweight level-1 upgrade: user provides their full name (no document yet).
router.post('/basic', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({ name: z.string().trim().min(2).max(100) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await prisma.user.update({
    where: { id: req.userId! },
    data:  { kycName: parse.data.name, kycLevel: Math.max(user.kycLevel ?? 0, 1) },
  });
  return res.json({ message: 'Basic details saved', level: Math.max(user.kycLevel ?? 0, 1) });
});

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
      data:  { kycStatus: 'APPROVED', kycLevel: 2 },
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
