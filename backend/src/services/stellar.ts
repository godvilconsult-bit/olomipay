/**
 * Stellar / Soroban service layer.
 *
 * All on-chain interactions go through this file. Uses stellar-sdk v12+
 * which includes SorobanRpc.Server built-in (no separate soroban-client needed).
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { decryptSecret } from './crypto';

// ── Network config ─────────────────────────────────────────────────────────────

const IS_TESTNET = (process.env.STELLAR_NETWORK ?? 'testnet') !== 'mainnet';

const NETWORK_PASSPHRASE = IS_TESTNET
  ? StellarSdk.Networks.TESTNET
  : StellarSdk.Networks.PUBLIC;

const HORIZON_URL = process.env.STELLAR_HORIZON_URL
  ?? (IS_TESTNET
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org');

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL
  ?? (IS_TESTNET
      ? 'https://soroban-testnet.stellar.org'
      : 'https://soroban-mainnet.stellar.org');

// USDC asset (Circle testnet issuer for testnet, mainnet issuer for prod)
const USDC_ISSUER = process.env.USDC_ISSUER
  ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export const USDC_ASSET = new StellarSdk.Asset('USDC', USDC_ISSUER);
export const XLM_ASSET  = StellarSdk.Asset.native();

// ── SDK clients ────────────────────────────────────────────────────────────────

const server   = new StellarSdk.Horizon.Server(HORIZON_URL);
const rpcServer = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: IS_TESTNET });

// ── Platform (anchor) keypair ──────────────────────────────────────────────────

function getPlatformKeypair(): StellarSdk.Keypair {
  return StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);
}

// ── Account / keypair helpers ──────────────────────────────────────────────────

/** Generate a brand-new Stellar keypair for a new user. */
export function generateKeypair(): { publicKey: string; secretKey: string } {
  const kp = StellarSdk.Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

/** Return the user's Keypair after decrypting their stored secret with their PIN. */
export function getUserKeypair(
  encryptedSecret: string,
  pin: string,
  phone: string,
): StellarSdk.Keypair {
  const secret = decryptSecret(encryptedSecret, pin, phone);
  return StellarSdk.Keypair.fromSecret(secret);
}

// ── Account funding ────────────────────────────────────────────────────────────

/**
 * Create and fund a new user account on Stellar.
 *
 * The platform anchor pays the minimum reserve (1.5 XLM base + 0.5 XLM per
 * trustline). On testnet we also add friendbot funding for dev convenience.
 */
export async function createAndFundAccount(publicKey: string): Promise<string> {
  if (IS_TESTNET) {
    // Use friendbot for testnet (free XLM for testing)
    await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  }

  // Regardless of network, the anchor establishes the USDC trustline for the user
  await addUsdcTrustline(publicKey, getPlatformKeypair().secret());

  return publicKey;
}

/**
 * Submit a transaction from the platform keypair to add a USDC trustline
 * on behalf of a user — or the user can do it themselves if they have XLM.
 */
export async function addUsdcTrustline(
  accountPublicKey: string,
  signerSecret: string,
): Promise<string> {
  const keypair = StellarSdk.Keypair.fromSecret(signerSecret);
  const account = await server.loadAccount(accountPublicKey);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.changeTrust({ asset: USDC_ASSET }))
    .setTimeout(30)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

// ── Balance queries ────────────────────────────────────────────────────────────

export interface WalletBalance {
  xlm:  string; // in XLM (7-decimal string)
  usdc: string; // in USDC (7-decimal string)
}

export async function getBalance(publicKey: string): Promise<WalletBalance> {
  try {
    const account = await server.loadAccount(publicKey);
    let xlm  = '0';
    let usdc = '0';

    for (const b of account.balances) {
      if (b.asset_type === 'native') {
        xlm = b.balance;
      } else if (
        b.asset_type === 'credit_alphanum4' &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === USDC_ISSUER
      ) {
        usdc = b.balance;
      }
    }

    return { xlm, usdc };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      // Account not activated yet
      return { xlm: '0', usdc: '0' };
    }
    throw err;
  }
}

// ── Transaction history ────────────────────────────────────────────────────────

export async function getTransactionHistory(publicKey: string, limit = 20) {
  const payments = await server
    .payments()
    .forAccount(publicKey)
    .limit(limit)
    .order('desc')
    .call();

  return payments.records.map((p: any) => ({
    id:        p.id,
    type:      p.type,
    from:      p.from,
    to:        p.to,
    amount:    p.amount,
    asset:     p.asset_code ?? 'XLM',
    createdAt: p.created_at,
    memo:      p.transaction?.memo,
  }));
}

// ── USDC transfer via Soroban contract ────────────────────────────────────────

/**
 * Call the OlomiPay Soroban contract's `transfer` function.
 * The user's PIN is required to decrypt their secret key.
 */
export async function contractTransfer(params: {
  fromEncryptedSecret: string;
  fromPin:             string;
  fromPhone:           string;
  fromPublicKey:       string;
  toPublicKey:         string;
  amountUsdc:          number; // in USDC units (e.g. 10.5)
  memo:                string;
}): Promise<string> {
  const {
    fromEncryptedSecret, fromPin, fromPhone,
    fromPublicKey, toPublicKey, amountUsdc, memo,
  } = params;

  const contractId = process.env.SOROBAN_CONTRACT_ID!;
  const signer     = getUserKeypair(fromEncryptedSecret, fromPin, fromPhone);

  // Convert USDC to stroops (7 decimal places → multiply by 10^7)
  // We use BigInt to avoid float precision issues in financial arithmetic
  const amountStroops = BigInt(Math.round(amountUsdc * 10_000_000));

  const contract = new StellarSdk.Contract(contractId);

  // Build Soroban token address for USDC
  const usdcAddress = new StellarSdk.Address(
    StellarSdk.Asset.contractId(USDC_ASSET, NETWORK_PASSPHRASE),
  );

  const fromAddress = new StellarSdk.Address(fromPublicKey);
  const toAddress   = new StellarSdk.Address(toPublicKey);

  const account  = await rpcServer.getAccount(fromPublicKey);
  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee:               '1000000', // 0.1 XLM max fee for Soroban ops
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'transfer',
        StellarSdk.nativeToScVal(fromAddress,  { type: 'address' }),
        StellarSdk.nativeToScVal(toAddress,    { type: 'address' }),
        StellarSdk.nativeToScVal(usdcAddress,  { type: 'address' }),
        StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
        StellarSdk.nativeToScVal(memo,          { type: 'string' }),
      ),
    )
    .setTimeout(30);

  const tx        = txBuilder.build();
  const simResult = await rpcServer.simulateTransaction(tx);

  if (StellarSdk.SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(signer);

  const sendResult = await rpcServer.sendTransaction(preparedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for confirmation (up to 30 seconds)
  const hash = sendResult.hash;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await rpcServer.getTransaction(hash);
    if (status.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return hash;
    }
    if (status.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${hash}`);
    }
  }

  // Timed out waiting — return hash anyway so caller can poll
  return hash;
}

/**
 * Simple USDC transfer NOT through the Soroban contract (used by the anchor
 * when crediting user accounts after M-Pesa deposit confirmation).
 */
export async function platformSendUsdc(
  toPublicKey: string,
  amountUsdc:  number,
  memo?:       string,
): Promise<string> {
  const anchor  = getPlatformKeypair();
  const account = await server.loadAccount(anchor.publicKey());

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    StellarSdk.Operation.payment({
      destination: toPublicKey,
      asset:       USDC_ASSET,
      amount:      amountUsdc.toFixed(7),
    }),
  );

  if (memo) {
    txBuilder.addMemo(StellarSdk.Memo.text(memo.slice(0, 28)));
  }

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(anchor);

  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Collect USDC from user (for withdrawal). User must have authorised via PIN.
 */
export async function userSendUsdcToPlatform(params: {
  encryptedSecret: string;
  pin:             string;
  phone:           string;
  publicKey:       string;
  amountUsdc:      number;
  memo?:           string;
}): Promise<string> {
  const { encryptedSecret, pin, phone, publicKey, amountUsdc, memo } = params;
  const signer  = getUserKeypair(encryptedSecret, pin, phone);
  const account = await server.loadAccount(publicKey);

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    StellarSdk.Operation.payment({
      destination: getPlatformKeypair().publicKey(),
      asset:       USDC_ASSET,
      amount:      amountUsdc.toFixed(7),
    }),
  );

  if (memo) txBuilder.addMemo(StellarSdk.Memo.text(memo.slice(0, 28)));

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(signer);

  const result = await server.submitTransaction(tx);
  return result.hash;
}
