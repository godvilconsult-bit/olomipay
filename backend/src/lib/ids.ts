import crypto from 'crypto';

/** Human-friendly order number, e.g. JIKO-7QX4M2. */
export function makeOrderNo(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return `JIKO-${s}`;
}

/** 4-digit proof-of-delivery OTP the rider confirms at the doorstep. */
export function makeOtp(): string {
  return String(crypto.randomInt(1000, 10000));
}
