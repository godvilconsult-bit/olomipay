/**
 * Key encryption helpers.
 *
 * User Stellar secret keys are encrypted with AES-256-GCM.
 * The encryption key is derived from:
 *   PBKDF2(userPin + phone, serverSalt, 310_000, 32, sha512)
 *
 * This means neither the server alone nor the PIN alone is sufficient to
 * decrypt — the user must supply their PIN for signing.
 */

import crypto from 'crypto';
import { getSecret } from './secrets';

// The at-rest encryption secret is sourced through the central secrets provider
// (managed store → env fallback), read at call-time so it picks up the value
// loaded at boot. Optional previous key is used ONLY for decryption during an
// ENCRYPTION_KEY rotation window.
const serverSecret         = (): string => getSecret('ENCRYPTION_KEY') ?? '';
const serverSecretPrevious = (): string | undefined => getSecret('ENCRYPTION_KEY_PREVIOUS');
const ALGORITHM = 'aes-256-gcm';

function deriveKey(pin: string, phone: string, srvSecret: string = serverSecret()): Buffer {
  // PBKDF2 with server secret mixed in as salt material
  const salt = crypto.createHash('sha256')
    .update(phone + srvSecret)
    .digest();
  return crypto.pbkdf2Sync(pin, salt, 310_000, 32, 'sha512');
}

export function encryptSecret(stellarSecret: string, pin: string, phone: string): string {
  const key  = deriveKey(pin, phone);
  const iv   = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(stellarSecret, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Return iv:authTag:ciphertext as base64-encoded colon-delimited string
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/** Thrown when a stored key can't be parsed/decrypted (corrupt or legacy format). */
export class WalletKeyError extends Error {
  constructor(msg = 'WALLET_KEY_CORRUPT') { super(msg); this.name = 'WalletKeyError'; }
}

/**
 * Validate that a stored encrypted key has the current iv:tag:data shape —
 * WITHOUT needing the PIN. Lets us proactively flag corrupt/legacy wallets.
 */
export function isEncryptedKeyValid(payload?: string | null): boolean {
  if (!payload || typeof payload !== 'string') return false;
  const parts = payload.split(':');
  if (parts.length !== 3) return false;
  const [ivHex, tagHex, dataHex] = parts;
  return /^[0-9a-fA-F]{24}$/.test(ivHex)
    && /^[0-9a-fA-F]{32}$/.test(tagHex)
    && /^[0-9a-fA-F]+$/.test(dataHex);
}

export function decryptSecret(encryptedPayload: string, pin: string, phone: string): string {
  // Validate the iv:tag:data shape before touching the cipher so we fail with a
  // clear, actionable error instead of a cryptic "invalid initialization vector".
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new WalletKeyError();
  }
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) throw new WalletKeyError();
  const [ivHex, tagHex, dataHex] = parts;
  // GCM IV must be 12 bytes (24 hex chars); auth tag 16 bytes (32 hex chars).
  if (!/^[0-9a-fA-F]{24}$/.test(ivHex) || !/^[0-9a-fA-F]{32}$/.test(tagHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
    throw new WalletKeyError();
  }

  const attempt = (srvSecret: string): string => {
    const key = deriveKey(pin, phone, srvSecret);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  };

  try {
    return attempt(serverSecret());
  } catch {
    // During an ENCRYPTION_KEY rotation, fall back to the previous key so existing
    // blobs keep working. Callers re-encrypt under the current key on the next PIN use.
    const prev = serverSecretPrevious();
    if (prev) {
      try { return attempt(prev); } catch { /* fall through */ }
    }
    // Wrong PIN (auth-tag mismatch) or corrupt data — caller decides messaging.
    throw new WalletKeyError('WALLET_KEY_UNREADABLE');
  }
}

export function hashPin(pin: string): string {
  // bcrypt is imported dynamically to keep this module testable without native bindings
  const bcrypt = require('bcrypt');
  return bcrypt.hashSync(pin, 12);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(pin, hash);
}
