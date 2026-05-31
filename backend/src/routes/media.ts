import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const ok   = (data: any) => ({ success: true, data });
const fail = (msg: string) => ({ success: false, error: msg });

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only images allowed'));
    }
    cb(null, true);
  },
});

const r2 = process.env.R2_ACCOUNT_ID
  ? new S3Client({
      region:   'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

// Magic byte check
const MAGIC_BYTES: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff],
  png:  [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],
  gif:  [0x47, 0x49, 0x46, 0x38],
};

function isValidImage(buffer: Buffer): boolean {
  for (const bytes of Object.values(MAGIC_BYTES)) {
    if (bytes.every((b, i) => buffer[i] === b)) return true;
  }
  return false;
}

// ── POST /api/chat/media/upload ───────────────────────────────────────────────
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json(fail('Hakuna picha imechaguliwa.'));
  if (!isValidImage(req.file.buffer)) return res.status(400).json(fail('Faili si picha halisi.'));

  try {
    // Compress images
    const fullSize = await sharp(req.file.buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const thumb = await sharp(req.file.buffer)
      .resize(200, 200, { fit: 'cover' })
      .webp({ quality: 70 })
      .toBuffer();

    const uuid = crypto.randomBytes(16).toString('hex');
    const baseKey = `chat/media/${req.userId}/${uuid}`;

    if (!r2) {
      // Mock mode for local dev — return base64 data URLs
      return res.json(ok({
        mediaUrl:      `data:image/webp;base64,${fullSize.toString('base64')}`,
        mediaThumbUrl: `data:image/webp;base64,${thumb.toString('base64')}`,
        mimeType:      'image/webp',
        mock:          true,
      }));
    }

    const bucket = process.env.R2_BUCKET_NAME!;
    const publicBase = process.env.R2_PUBLIC_URL!;

    await Promise.all([
      r2.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         `${baseKey}.webp`,
        Body:        fullSize,
        ContentType: 'image/webp',
      })),
      r2.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         `${baseKey}_thumb.webp`,
        Body:        thumb,
        ContentType: 'image/webp',
      })),
    ]);

    return res.json(ok({
      mediaUrl:      `${publicBase}/${baseKey}.webp`,
      mediaThumbUrl: `${publicBase}/${baseKey}_thumb.webp`,
      mimeType:      'image/webp',
    }));
  } catch (e: any) {
    console.error('[media]', e.message);
    return res.status(500).json(fail('Kupakia picha kumeshindwa.'));
  }
});

export { router as mediaRouter };
