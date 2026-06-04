/**
 * Step-Up Authentication for high-risk admin actions.
 *
 * RFC 6238 TOTP verification — identical algorithm to admin-ops.ts so the
 * same authenticator-app secret verifies in both places.
 *
 * Backward-compatible by design (cannot lock out existing admins):
 *   • If the admin has NOT enabled TOTP (adminTotpEnabled = false) → PASS.
 *     Existing admins keep working exactly as before.
 *   • If the admin HAS enabled TOTP → a fresh 6-digit `totpCode` must be
 *     supplied in the request body and validated within a ±30s window.
 *
 * Use on money-moving / bulk-export endpoints to satisfy the
 * "fresh authorization for high-risk actions" requirement.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function fromBase32(s: string): Buffer {
  let bits = 0, val = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totp(secretB32: string, step = 30, t = Date.now()): string {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', fromBase32(secretB32)).update(buf).digest();
  const off  = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

function verifyTotp(secretB32: string, token: string): boolean {
  const now = Date.now();
  for (const drift of [-1, 0, 1]) {
    if (totp(secretB32, 30, now + drift * 30_000) === token) return true;
  }
  return false;
}

/**
 * Express middleware: enforce step-up for high-risk actions.
 * Reads `totpCode` from the request body when the admin has 2FA enabled.
 */
export function requireStepUp() {
  return async (req: AuthRequest, res: any, next: any) => {
    try {
      const u = await prisma.user.findUnique({
        where:  { id: req.userId! },
        select: { adminTotpEnabled: true, adminTotpSecret: true },
      });

      // Not enrolled in 2FA → backward-compatible pass-through
      if (!u?.adminTotpEnabled || !u.adminTotpSecret) return next();

      const code = String(req.body?.totpCode ?? req.headers['x-totp-code'] ?? '');
      if (!code) {
        return res.status(401).json({ success: false, error: 'Step-up required: provide totpCode', code: 'STEP_UP_REQUIRED' });
      }
      if (!verifyTotp(u.adminTotpSecret, code)) {
        return res.status(401).json({ success: false, error: 'Invalid 2FA code', code: 'STEP_UP_INVALID' });
      }
      return next();
    } catch (e: any) {
      // On error, do NOT silently allow a high-risk action — require step-up explicitly
      return res.status(500).json({ success: false, error: 'Step-up check failed' });
    }
  };
}

export { verifyTotp };
