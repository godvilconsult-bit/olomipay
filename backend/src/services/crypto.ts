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

const SERVER_SECRET = process.env.ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

function deriveKey(pin: string, phone: string): Buffer {
  // PBKDF2 with server secret mixed in as salt material
  const salt = crypto.createHash('sha256')
    .update(phone + SERVER_SECRET)
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

  try {
    const key = deriveKey(pin, phone);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
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
