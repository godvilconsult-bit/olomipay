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

export function decryptSecret(encryptedPayload: string, pin: string, phone: string): string {
  const [ivHex, tagHex, dataHex] = encryptedPayload.split(':');
  const key = deriveKey(pin, phone);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
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
