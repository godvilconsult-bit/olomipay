#!/usr/bin/env node
/**
 * One-shot secret generator for OlomiPay.
 *
 *   node backend/scripts/gen-secrets.mjs
 *
 * Prints fresh, strong values ready to paste into Railway → Variables.
 * Runs entirely on YOUR machine — nothing is sent anywhere. The secrets are
 * NOT written to disk; copy them straight into Railway, then close the terminal.
 *
 * ⚠ WALLET_DERIVATION_SECRET: set it once, BACK IT UP offline, and never change it.
 *   It is the backbone of every user's recoverable wallet address.
 */

import { randomBytes } from 'node:crypto';

const hex32 = () => randomBytes(32).toString('hex');

const secrets = {
  WALLET_DERIVATION_SECRET: hex32(),
  ENCRYPTION_KEY:           hex32(),
  JWT_SECRET:               hex32(),
  JWT_REFRESH_SECRET:       hex32(),
};

// Guarantee the two JWT secrets differ (astronomically unlikely to collide, but cheap).
while (secrets.JWT_SECRET === secrets.JWT_REFRESH_SECRET) secrets.JWT_REFRESH_SECRET = hex32();

const line = '─'.repeat(72);
console.log(`\n${line}`);
console.log('  OlomiPay — generated secrets (paste into Railway → Variables)');
console.log(`${line}\n`);

for (const [k, v] of Object.entries(secrets)) console.log(`${k}=${v}`);

console.log(`\n${line}`);
console.log('  ⚠  BACK UP WALLET_DERIVATION_SECRET in a password manager NOW.');
console.log('     If it is lost or changed after users exist, their funds become');
console.log('     unreachable. The other three can be rotated (see SECRET_ROTATION.md).');
console.log(`${line}\n`);
