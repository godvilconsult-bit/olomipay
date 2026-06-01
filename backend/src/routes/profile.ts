import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma  = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp|gif)$/.test(file.mimetype)) return cb(new Error('Images only'));
    cb(null, true);
  },
});

const r2 = process.env.R2_ACCOUNT_ID
  ? new S3Client({
      region:   'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    })
  : null;

const MAGIC: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46], gif: [0x47, 0x49, 0x46, 0x38],
};
function validImage(buf: Buffer): boolean {
  return Object.values(MAGIC).some(bytes => bytes.every((b, i) => buf[i] === b));
}

async function uploadBuffer(buf: Buffer, key: string): Promise<string> {
  if (!r2) return `data:image/webp;base64,${buf.toString('base64')}`;
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: buf, ContentType: 'image/webp',
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// ── POST /api/profile/avatar ───────────────────────────────────────────────────
router.post('/avatar', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file)                    return res.status(400).json(fail('No image provided'));
  if (!validImage(req.file.buffer)) return res.status(400).json(fail('Invalid image file'));

  try {
    const uid  = req.userId!;
    const uuid = crypto.randomBytes(12).toString('hex');

    // 400×400 avatar, 90% quality
    const avatar = await sharp(req.file.buffer)
      .resize(400, 400, { fit: 'cover', position: 'attention' })
      .webp({ quality: 90 })
      .toBuffer();

    // 80×80 thumbnail
    const thumb = await sharp(req.file.buffer)
      .resize(80, 80, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();

    const [avatarUrl, thumbUrl] = await Promise.all([
      uploadBuffer(avatar, `avatars/${uid}/${uuid}.webp`),
      uploadBuffer(thumb,  `avatars/${uid}/${uuid}_thumb.webp`),
    ]);

    await prisma.user.update({
      where: { id: uid },
      data:  { profilePicUrl: avatarUrl },
    });

    return res.json(ok({ avatarUrl, thumbUrl }));
  } catch (e: any) {
    console.error('[avatar]', e.message);
    return res.status(500).json(fail('Upload failed: ' + e.message));
  }
});

// ── GET /api/profile/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { id: true, phone: true, kycName: true, kycStatus: true,
              stellarPubKey: true, profilePicUrl: true, createdAt: true,
              chatPublicKey: true, isOnline: true, lastSeenAt: true,
              isAdmin: true, isFeeCollector: true },
  });
  if (!user) return res.status(404).json(fail('User not found'));
  const clean  = user.id.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const userTag = `OP-${(clean.slice(-8) + clean.slice(0, 4)).slice(0, 8)}`;
  return res.json(ok({ user: { ...user, userTag } }));
});

// ── PUT /api/profile/name ─────────────────────────────────────────────────────
router.put('/name', requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body;
  if (!name || name.trim().length < 2) return res.status(400).json(fail('Name must be at least 2 characters'));
  await prisma.user.update({ where: { id: req.userId! }, data: { kycName: name.trim() } });
  return res.json(ok({ message: 'Name updated' }));
});

export { router as profileRouter };
