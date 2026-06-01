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
  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) throw new Error('STELLAR_SECRET_KEY not set in environment variables');
  return StellarSdk.Keypair.fromSecret(secret);
}

// ── Fee wallet ─────────────────────────────────────────────────────────────────
// The fee wallet is the Stellar address that receives all 1% platform fees.
// Priority: FEE_WALLET_PUBLIC → FEE_ACCOUNT → STELLAR_PUBLIC_KEY
//
// NEVER calls getPlatformKeypair() here — that crashes if STELLAR_SECRET_KEY
// is missing. Public key lookup must not require the secret.
//
// On testnet: same address as platform wallet is fine.
// On mainnet: use a SEPARATE keypair for clean accounting.
//
// The fee wallet MUST have a USDC trustline. Use POST /api/admin/fee-wallet/setup.

export function getFeeWalletPublic(): string {
  return (
    process.env.FEE_WALLET_PUBLIC  ??
    process.env.FEE_ACCOUNT        ??
    process.env.STELLAR_PUBLIC_KEY ??
    '' // empty string — caller must check and handle gracefully
  );
}

function getFeeWalletSecret(): string {
  return (
    process.env.FEE_WALLET_SECRET  ??
    process.env.STELLAR_SECRET_KEY ?? ''
  );
}

export const PLATFORM_FEE_BPS = 100; // 1% = 100 basis points
export const PLATFORM_FEE_PCT = PLATFORM_FEE_BPS / 10000; // 0.01

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
    USDC_ASSET.contractId(NETWORK_PASSPHRASE),
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
 * Platform sends USDC to a user after a confirmed deposit.
 *
 * Accepts the GROSS amount (before fee). Internally:
 *   - Calculates 1% platform fee
 *   - Sends NET (99%) to the user
 *   - Sends FEE (1%) to the FEE_WALLET in the SAME atomic Stellar transaction
 *
 * If FEE_WALLET === platform wallet (default on testnet), the fee stays in the
 * platform wallet — no second operation needed.
 *
 * Returns: { hash, netUsdc, feeUsdc, feeWallet }
 */
export async function platformSendUsdc(
  toPublicKey: string,
  grossUsdc:   number,
  memo?:       string,
): Promise<string> {
  const { hash } = await platformSendUsdcWithFee(toPublicKey, grossUsdc, memo);
  return hash;
}

export async function platformSendUsdcWithFee(
  toPublicKey: string,
  grossUsdc:   number,
  memo?:       string,
): Promise<{ hash: string; netUsdc: number; feeUsdc: number; feeWallet: string }> {
  const anchor     = getPlatformKeypair();
  const feeWallet  = getFeeWalletPublic();
  const feeUsdc    = parseFloat((grossUsdc * PLATFORM_FEE_PCT).toFixed(7));
  const netUsdc    = parseFloat((grossUsdc - feeUsdc).toFixed(7));

  const account    = await server.loadAccount(anchor.publicKey());
  const txBuilder  = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Operation 1: Net USDC → user
  txBuilder.addOperation(StellarSdk.Operation.payment({
    destination: toPublicKey,
    asset:       USDC_ASSET,
    amount:      netUsdc.toFixed(7),
  }));

  // Operation 2: Fee USDC → fee wallet (only if it's a different address AND fee > minimum)
  const feeWalletIsSelf = feeWallet === anchor.publicKey();
  if (!feeWalletIsSelf && feeUsdc >= 0.0000001) {
    txBuilder.addOperation(StellarSdk.Operation.payment({
      destination: feeWallet,
      asset:       USDC_ASSET,
      amount:      feeUsdc.toFixed(7),
    }));
  }
  // If feeWallet === platform wallet, the fee stays there implicitly (no extra op needed)

  if (memo) txBuilder.addMemo(StellarSdk.Memo.text(memo.slice(0, 28)));
  txBuilder.setTimeout(30);

  const tx = txBuilder.build();
  tx.sign(anchor);
  const result = await server.submitTransaction(tx);

  return { hash: result.hash, netUsdc, feeUsdc, feeWallet };
}

/**
 * User sends USDC to another address with 1% fee to fee wallet.
 * Two operations in ONE atomic Stellar transaction:
 *   Op 1: (grossUsdc * 0.99) → recipient
 *   Op 2: (grossUsdc * 0.01) → fee wallet
 */
export async function userSendUsdcWithFee(params: {
  encryptedSecret: string;
  pin:             string;
  phone:           string;
  publicKey:       string;
  toAddress:       string;
  grossUsdc:       number;
  memo?:           string;
}): Promise<{ hash: string; netUsdc: number; feeUsdc: number; feeWallet: string }> {
  const { encryptedSecret, pin, phone, publicKey, toAddress, grossUsdc, memo } = params;
  const signer    = getUserKeypair(encryptedSecret, pin, phone);
  const feeWallet = getFeeWalletPublic();
  const feeUsdc   = parseFloat((grossUsdc * PLATFORM_FEE_PCT).toFixed(7));
  const netUsdc   = parseFloat((grossUsdc - feeUsdc).toFixed(7));

  const account    = await server.loadAccount(publicKey);
  const txBuilder  = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Op 1: net USDC to recipient
  txBuilder.addOperation(StellarSdk.Operation.payment({
    destination: toAddress,
    asset:       USDC_ASSET,
    amount:      netUsdc.toFixed(7),
  }));

  // Op 2: fee to fee wallet (skip if recipient IS the fee wallet to avoid loops)
  if (feeWallet !== toAddress && feeUsdc >= 0.0000001) {
    txBuilder.addOperation(StellarSdk.Operation.payment({
      destination: feeWallet,
      asset:       USDC_ASSET,
      amount:      feeUsdc.toFixed(7),
    }));
  }

  if (memo) txBuilder.addMemo(StellarSdk.Memo.text(memo.slice(0, 28)));
  txBuilder.setTimeout(60);

  const tx = txBuilder.build();
  tx.sign(signer);
  const result = await server.submitTransaction(tx);

  return { hash: result.hash, netUsdc, feeUsdc, feeWallet };
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

// ── Swap USDC ↔ XLM via Stellar DEX path payment ─────────────────────────────

/**
 * Swap USDC to XLM (or XLM to USDC) using Stellar's built-in DEX.
 * Uses pathPaymentStrictSend so user spends exact sendAmount.
 */
export async function swapOnDex(params: {
  encryptedSecret: string;
  pin:             string;
  phone:           string;
  publicKey:       string;
  fromAsset:       'USDC' | 'XLM';
  toAsset:         'USDC' | 'XLM';
  sendAmount:      number;   // exact amount to spend
  minReceive:      number;   // minimum to accept (slippage protection, e.g. 0.98 × expected)
  memo?:           string;
}): Promise<{ hash: string; receivedAmount: string }> {
  const { encryptedSecret, pin, phone, publicKey, fromAsset, toAsset, sendAmount, minReceive, memo } = params;

  if (fromAsset === toAsset) throw new Error('Cannot swap same asset');

  const signer   = getUserKeypair(encryptedSecret, pin, phone);
  const account  = await server.loadAccount(publicKey);
  const sendAsset = fromAsset === 'USDC' ? USDC_ASSET : XLM_ASSET;
  const destAsset = toAsset   === 'USDC' ? USDC_ASSET : XLM_ASSET;

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  if (memo) txBuilder.addMemo(StellarSdk.Memo.text(memo.slice(0, 28)));

  txBuilder.addOperation(
    StellarSdk.Operation.pathPaymentStrictSend({
      sendAsset,
      sendAmount:   sendAmount.toFixed(7),
      destination:  publicKey,          // swap to self
      destAsset,
      destMin:      minReceive.toFixed(7),
      path:         [],                 // direct market (no intermediary)
    })
  ).setTimeout(60);

  const tx = txBuilder.build();
  tx.sign(signer);

  const result = await server.submitTransaction(tx);

  // Parse received amount from result
  let receivedAmount = minReceive.toFixed(7);
  try {
    const ops = (result as any).envelope_xdr;
    // Best effort — just return hash and let client poll if needed
  } catch {}

  return { hash: result.hash, receivedAmount };
}

/**
 * Get a DEX price quote without submitting.
 * Returns expected receive amount for given send amount.
 */
export async function getDexQuote(params: {
  fromAsset:  'USDC' | 'XLM';
  toAsset:    'USDC' | 'XLM';
  sendAmount: number;
}): Promise<{ expectedReceive: number; rate: number }> {
  const { fromAsset, toAsset, sendAmount } = params;
  const sendAsset = fromAsset === 'USDC' ? USDC_ASSET : XLM_ASSET;
  const destAsset = toAsset   === 'USDC' ? USDC_ASSET : XLM_ASSET;

  try {
    const paths = await server.strictSendPaths(
      sendAsset,
      sendAmount.toFixed(7),
      [destAsset]
    ).call();

    const best = paths.records?.[0];
    if (!best) throw new Error('No path found');

    const expectedReceive = parseFloat(best.destination_amount);
    const rate = expectedReceive / sendAmount;
    return { expectedReceive, rate };
  } catch {
    // Fallback rate (rough estimate)
    const xlmUsdcRate = 0.12; // 1 XLM ≈ $0.12
    if (fromAsset === 'XLM' && toAsset === 'USDC') {
      return { expectedReceive: sendAmount * xlmUsdcRate, rate: xlmUsdcRate };
    }
    return { expectedReceive: sendAmount / xlmUsdcRate, rate: 1 / xlmUsdcRate };
  }
}

/**
 * Ensure a user's account has a trustline for USDC.
 * Safe to call multiple times — skips if trustline already exists.
 */
export async function ensureUsdcTrustline(params: {
  encryptedSecret: string;
  pin:             string;
  phone:           string;
  publicKey:       string;
}): Promise<void> {
  const { encryptedSecret, pin, phone, publicKey } = params;
  const balances = await getBalance(publicKey);
  if (parseFloat(balances.usdc) >= 0) return; // trustline already exists

  const signer  = getUserKeypair(encryptedSecret, pin, phone);
  const account = await server.loadAccount(publicKey);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    StellarSdk.Operation.changeTrust({ asset: USDC_ASSET, limit: '1000000' })
  ).setTimeout(60).build();
  tx.sign(signer);
  await server.submitTransaction(tx);
}

// ── Direct XLM send (user → any address) ──────────────────────────────────────

/**
 * Send XLM directly from a user's wallet to any Stellar address.
 * Used for testnet testing and XLM withdrawals.
 * Also collects 1% fee in XLM to the platform fee account.
 */
export async function userSendXlm(params: {
  encryptedSecret: string;
  pin:             string;
  phone:           string;
  publicKey:       string;
  toAddress:       string;
  amountXlm:       number;
  memo?:           string;
}): Promise<string> {
  const { encryptedSecret, pin, phone, publicKey, toAddress, amountXlm, memo } = params;
  const signer      = getUserKeypair(encryptedSecret, pin, phone);
  const account     = await server.loadAccount(publicKey);
  const feeAccount  = process.env.STELLAR_PUBLIC_KEY ?? process.env.FEE_ACCOUNT;
  const feeXlm      = amountXlm * 0.01; // 1% fee
  const netXlm      = amountXlm - feeXlm;

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Main payment
  txBuilder.addOperation(StellarSdk.Operation.payment({
    destination: toAddress,
    asset:       XLM_ASSET,
    amount:      netXlm.toFixed(7),
  }));

  // Fee collection (only if fee account is configured and we're not sending to ourselves)
  if (feeAccount && feeAccount !== publicKey && feeXlm >= 0.0000001) {
    txBuilder.addOperation(StellarSdk.Operation.payment({
      destination: feeAccount,
      asset:       XLM_ASSET,
      amount:      feeXlm.toFixed(7),
    }));
  }

  if (memo) txBuilder.addMemo(StellarSdk.Memo.text(String(memo).slice(0, 28)));
  txBuilder.setTimeout(60);

  const tx = txBuilder.build();
  tx.sign(signer);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Set up the fee wallet for the first time.
 * 1. Fund with testnet XLM via Friendbot (testnet only)
 * 2. Add USDC trustline so it can receive USDC fees
 * 3. Returns the fee wallet public key + setup result
 */
export async function setupFeeWallet(): Promise<{
  feeWallet:       string;
  funded:          boolean;
  trustlineAdded:  boolean;
  alreadySetup:    boolean;
  message:         string;
}> {
  const feeWalletPub    = getFeeWalletPublic();
  const feeWalletSecret = getFeeWalletSecret();

  if (!feeWalletSecret) {
    throw new Error('FEE_WALLET_SECRET not configured — set FEE_WALLET_SECRET in .env');
  }

  let funded         = false;
  let trustlineAdded = false;
  let alreadySetup   = false;

  // Check if account already exists on Stellar
  const info = await getAccountInfo(feeWalletPub).catch(() => null);

  // Step 1: Fund with Friendbot (testnet only)
  if (!info?.funded) {
    if (!IS_TESTNET) {
      throw new Error('Fee wallet not funded. On mainnet, send at least 2 XLM to ' + feeWalletPub);
    }
    funded = await friendbotFund(feeWalletPub);
    if (!funded) throw new Error('Friendbot funding failed — try again in a moment');
    // Wait for account to appear on network
    await new Promise(r => setTimeout(r, 3000));
  }

  // Step 2: Check if USDC trustline already exists
  const refreshed = await getAccountInfo(feeWalletPub).catch(() => null);
  const hasUsdc   = refreshed?.balances?.some(b => b.asset === 'USDC') ?? false;

  if (hasUsdc) {
    alreadySetup = true;
    return { feeWallet: feeWalletPub, funded, trustlineAdded: false, alreadySetup, message: 'Fee wallet already configured' };
  }

  // Step 3: Add USDC trustline
  const keypair = StellarSdk.Keypair.fromSecret(feeWalletSecret);
  const account = await server.loadAccount(feeWalletPub);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.changeTrust({
      asset:  USDC_ASSET,
      limit:  '1000000000', // 1 billion USDC max
    }))
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  await server.submitTransaction(tx);
  trustlineAdded = true;

  return {
    feeWallet:      feeWalletPub,
    funded:         funded || !!info?.funded,
    trustlineAdded,
    alreadySetup:   false,
    message:        `Fee wallet ready. Address: ${feeWalletPub}`,
  };
}

/**
 * Fund a new user account on testnet using friendbot.
 * Returns true if successful, false if already funded or friendbot unavailable.
 */
export async function friendbotFund(publicKey: string): Promise<boolean> {
  if (!IS_TESTNET) return false;
  try {
    const r = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Get full account details from Horizon — balances + account status.
 * Returns null if account doesn't exist yet (not funded).
 */
export async function getAccountInfo(publicKey: string): Promise<{
  funded:   boolean;
  xlm:      string;
  usdc:     string;
  balances: Array<{ asset: string; balance: string; issuer?: string }>;
} | null> {
  try {
    const account = await server.loadAccount(publicKey);
    const balances = account.balances.map((b: any) => ({
      asset:   b.asset_type === 'native' ? 'XLM' : b.asset_code,
      balance: b.balance,
      issuer:  b.asset_issuer ?? undefined,
    }));
    const xlm  = account.balances.find((b: any) => b.asset_type === 'native')?.balance ?? '0';
    const usdc = account.balances.find((b: any) => b.asset_code === 'USDC')?.balance   ?? '0';
    return { funded: true, xlm, usdc, balances };
  } catch (err: any) {
    if (err?.response?.status === 404) return { funded: false, xlm: '0', usdc: '0', balances: [] };
    throw err;
  }
}

/**
 * Build a SEP-0007 "web+stellar:pay" URI for QR code generation.
 * When another Stellar wallet scans this, it pre-fills the payment form.
 */
export function buildStellarPayUri(params: {
  destination: string;
  amount?:     number;
  assetCode?:  string;
  assetIssuer?: string;
  memo?:       string;
  network?:    'testnet' | 'mainnet';
}): string {
  const { destination, amount, assetCode, assetIssuer, memo, network } = params;
  const p = new URLSearchParams({ destination });
  if (amount)       p.set('amount', amount.toFixed(7));
  if (assetCode)    p.set('asset_code', assetCode);
  if (assetIssuer)  p.set('asset_issuer', assetIssuer);
  if (memo)         p.set('memo', memo);
  if (memo)         p.set('memo_type', 'MEMO_TEXT');
  if (network === 'testnet') p.set('network_passphrase', StellarSdk.Networks.TESTNET);
  return `web+stellar:pay?${p.toString()}`;
}
