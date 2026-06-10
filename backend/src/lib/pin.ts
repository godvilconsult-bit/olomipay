/**
 * PIN hashing — bcrypt. A user's 4–6 digit PIN is the auth secret alongside
 * their phone number. Hashed at rest; never stored or logged in clear text.
 */
import bcrypt from 'bcrypt';

const ROUNDS = 12;

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, ROUNDS);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
