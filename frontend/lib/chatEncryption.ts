/**
 * Client-side E2E encryption using NaCl box (tweetnacl).
 * Server NEVER sees plaintext — only stores ciphertext.
 */
import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

export class ChatEncryption {
  static generateKeyPair(): { publicKey: string; secretKey: string } {
    const kp = nacl.box.keyPair();
    return { publicKey: encodeBase64(kp.publicKey), secretKey: encodeBase64(kp.secretKey) };
  }

  static encrypt(plaintext: string, recipientPublicKey: string, mySecretKey: string): string {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const box = nacl.box(
      encodeUTF8(plaintext),
      nonce,
      decodeBase64(recipientPublicKey),
      decodeBase64(mySecretKey),
    );
    return JSON.stringify({ nonce: encodeBase64(nonce), box: encodeBase64(box) });
  }

  static decrypt(encrypted: string, senderPublicKey: string, mySecretKey: string): string | null {
    try {
      const { nonce, box } = JSON.parse(encrypted);
      const decrypted = nacl.box.open(
        decodeBase64(box),
        decodeBase64(nonce),
        decodeBase64(senderPublicKey),
        decodeBase64(mySecretKey),
      );
      return decrypted ? decodeUTF8(decrypted) : null;
    } catch {
      return null;
    }
  }

  // Group chat: symmetric secretbox
  static generateGroupKey(): string {
    return encodeBase64(nacl.randomBytes(nacl.secretbox.keyLength));
  }

  static encryptGroupMessage(plaintext: string, groupKey: string): string {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const box = nacl.secretbox(encodeUTF8(plaintext), nonce, decodeBase64(groupKey));
    return JSON.stringify({ nonce: encodeBase64(nonce), box: encodeBase64(box) });
  }

  static decryptGroupMessage(encrypted: string, groupKey: string): string | null {
    try {
      const { nonce, box } = JSON.parse(encrypted);
      const decrypted = nacl.secretbox.open(
        decodeBase64(box), decodeBase64(nonce), decodeBase64(groupKey),
      );
      return decrypted ? decodeUTF8(decrypted) : null;
    } catch {
      return null;
    }
  }
}

// In-memory key store — never persisted to localStorage
let _mySecretKey: string | null = null;

export function setMySecretKey(key: string)  { _mySecretKey = key; }
export function getMySecretKey(): string | null { return _mySecretKey; }
export function clearMySecretKey()           { _mySecretKey = null; }
