/**
 * Frontend Stellar helpers.
 *
 * The frontend NEVER holds the user's secret key. All signing happens
 * server-side after the user supplies their PIN via the API.
 * This file is for read-only on-chain queries only.
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const IS_TESTNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'mainnet';

export const HORIZON_URL = IS_TESTNET
  ? 'https://horizon-testnet.stellar.org'
  : 'https://horizon.stellar.org';

export const NETWORK_PASSPHRASE = IS_TESTNET
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

export const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ??
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export const USDC_ASSET = new StellarSdk.Asset('USDC', USDC_ISSUER);

/** Fetch balances directly from Horizon (used for offline-capable balance display). */
export async function fetchBalances(publicKey: string) {
  const account = await server.loadAccount(publicKey);
  let xlm  = '0.0000000';
  let usdc = '0.0000000';

  for (const b of account.balances) {
    if (b.asset_type === 'native') xlm = b.balance;
    if (
      b.asset_type === 'credit_alphanum4' &&
      (b as any).asset_code   === 'USDC' &&
      (b as any).asset_issuer === USDC_ISSUER
    ) {
      usdc = b.balance;
    }
  }

  return { xlm, usdc };
}

/** Validate that a Stellar address is an existing, funded account. */
export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await server.loadAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}
