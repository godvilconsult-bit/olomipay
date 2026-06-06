import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const ok   = (data: any) => ({ success: true, data });
const fail = (msg: string) => ({ success: false, error: msg });

// Accept images AND documents. Block only dangerous executables.
const BLOCKED_EXT = /\.(exe|bat|cmd|sh|msi|apk|app|scr|com|jar|dll|js|vbs|ps1)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    if (BLOCKED_EXT.test(file.originalname || '')) {
      return cb(new Error('This file type is not allowed for security reasons.'));
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

const isImage = (mime: string) => /^image\//.test(mime);
function sanitizeName(name: string): string {
  return (name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
}

// ── POST /api/chat/media/upload ───────────────────────────────────────────────
// Accepts any image format or document. Images are compressed (+ thumbnail);
// documents are stored as-is with their original name and type.
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json(fail('No file selected.'));

  const original = req.file.originalname || 'file';
  const mime     = req.file.mimetype || 'application/octet-stream';
  const uuid     = crypto.randomBytes(16).toString('hex');
  const bucket   = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;

  try {
    // ── IMAGES → compress + thumbnail ──────────────────────────────────────────
    if (isImage(mime)) {
      const fullSize = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      const thumb = await sharp(req.file.buffer)
        .rotate()
        .resize(320, 320, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer();

      const baseKey = `chat/media/${req.userId}/${uuid}`;
      if (!r2 || !bucket || !publicBase) {
        return res.json(ok({
          kind: 'image',
          mediaUrl:      `data:image/webp;base64,${fullSize.toString('base64')}`,
          mediaThumbUrl: `data:image/webp;base64,${thumb.toString('base64')}`,
          mimeType: 'image/webp', fileName: original, fileSize: fullSize.length, mock: true,
        }));
      }
      await Promise.all([
        r2.send(new PutObjectCommand({ Bucket: bucket, Key: `${baseKey}.webp`,       Body: fullSize, ContentType: 'image/webp' })),
        r2.send(new PutObjectCommand({ Bucket: bucket, Key: `${baseKey}_thumb.webp`, Body: thumb,    ContentType: 'image/webp' })),
      ]);
      return res.json(ok({
        kind: 'image',
        mediaUrl:      `${publicBase}/${baseKey}.webp`,
        mediaThumbUrl: `${publicBase}/${baseKey}_thumb.webp`,
        mimeType: 'image/webp', fileName: original, fileSize: fullSize.length,
      }));
    }

    // ── DOCUMENTS / other files → store as-is ──────────────────────────────────
    const safeName = sanitizeName(original);
    const baseKey  = `chat/files/${req.userId}/${uuid}/${safeName}`;
    if (!r2 || !bucket || !publicBase) {
      // Dev/mock: return a data URL (fine for small files)
      return res.json(ok({
        kind: 'file',
        mediaUrl: `data:${mime};base64,${req.file.buffer.toString('base64')}`,
        mediaThumbUrl: null, mimeType: mime, fileName: original, fileSize: req.file.size, mock: true,
      }));
    }
    await r2.send(new PutObjectCommand({
      Bucket: bucket, Key: baseKey, Body: req.file.buffer,
      ContentType: mime,
      ContentDisposition: `attachment; filename="${safeName}"`,
    }));
    return res.json(ok({
      kind: 'file',
      mediaUrl: `${publicBase}/${baseKey}`,
      mediaThumbUrl: null, mimeType: mime, fileName: original, fileSize: req.file.size,
    }));
  } catch (e: any) {
    console.error('[media]', e.message);
    return res.status(500).json(fail('Upload failed. Please try again.'));
  }
});

export { router as mediaRouter };
