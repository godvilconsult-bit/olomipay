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

/** True on testnet (free Friendbot gas), false on mainnet (user-funded activation). */
export const IS_TESTNET_NETWORK = IS_TESTNET;

/**
 * One-time wallet-activation fee charged on MAINNET only, auto-deducted from the
 * user's first deposit. It reimburses the platform for the XLM it fronted at
 * registration to create the account + USDC trustline. On testnet this is 0
 * (Friendbot funds gas for free).
 */
export const ACTIVATION_FEE_USD = Number(process.env.ACTIVATION_FEE_USD ?? '0.5');

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

// ── Gas treasury: users hold ZERO XLM ────────────────────────────────────────────
// Value always moves as USDC; XLM is only the network "gas" + the small account
// reserve Stellar requires. Both are paid by the PLATFORM TREASURY (the platform
// keypair), so users never need to buy, hold, or even see XLM.
//
//   • Gas        → every user-signed tx is wrapped in a FEE-BUMP paid by the
//                  treasury (submitWithPlatformFee), so the user pays no fee.
//   • Reserve    → new accounts are created with SPONSORED reserves on mainnet
//                  (startingBalance 0), so the user account locks 0 XLM.

/**
 * Submit a USER-signed transaction with the platform treasury paying the network
 * fee (fee-bump). This is how users hold zero XLM — they never pay gas.
 *
 * Falls back to submitting the inner tx directly if the treasury can't fee-bump
 * (e.g. STELLAR_SECRET_KEY unset, or treasury temporarily empty), so a transfer
 * is never blocked on a network where the account holds its own XLM (testnet).
 */
async function submitWithPlatformFee(
  innerTx: StellarSdk.Transaction,
): Promise<{ hash: string }> {
  try {
    const platform = getPlatformKeypair();
    const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      platform,
      String(Number(StellarSdk.BASE_FEE) * 20), // generous gas cap (~0.0002 XLM)
      innerTx,
      NETWORK_PASSPHRASE,
    );
    feeBump.sign(platform);
    const r = await server.submitTransaction(feeBump);
    return { hash: r.hash };
  } catch (e: any) {
    console.warn('[stellar] fee-bump unavailable, submitting inner tx directly:', e?.message);
    const r = await server.submitTransaction(innerTx);
    return { hash: r.hash };
  }
}

/**
 * Health of the XLM gas treasury (the platform keypair). The operator monitors
 * this so they can top up before they run out of gas / sponsorship capacity.
 */
export async function getTreasuryStatus(): Promise<{
  publicKey:        string;
  xlm:              number;
  estAccountsLeft:  number;  // how many more user accounts it can sponsor
  estTxLeft:        number;  // how many more transactions it can fee-bump
  healthy:          boolean;
}> {
  let publicKey = '';
  try { publicKey = getPlatformKeypair().publicKey(); }
  catch { publicKey = process.env.STELLAR_PUBLIC_KEY ?? ''; }

  let xlm = 0;
  try {
    const acct   = await server.loadAccount(publicKey);
    const native = acct.balances.find((b: any) => b.asset_type === 'native');
    xlm = parseFloat(native?.balance ?? '0');
  } catch { /* account may not exist yet */ }

  const RESERVE_PER_ACCOUNT = 1.6;    // base (1) + USDC trustline (0.5) + buffer
  const FEE_PER_TX          = 0.0002; // generous fee-bump cap
  const PLATFORM_MIN_BUFFER = 5;      // keep the treasury account itself alive
  const usable = Math.max(0, xlm - PLATFORM_MIN_BUFFER);

  return {
    publicKey,
    xlm,
    estAccountsLeft: Math.floor(usable / RESERVE_PER_ACCOUNT),
    estTxLeft:       Math.floor(usable / FEE_PER_TX),
    healthy:         xlm > 20,
  };
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

import crypto from 'crypto';

/**
 * Deterministically derive a user's Stellar keypair from their phone number.
 *
 * seed = HMAC-SHA256(WALLET_DERIVATION_SECRET, "olomipay-wallet-v1:" + phone)  → 32 bytes
 *
 * The SAME phone number always reproduces the EXACT SAME wallet address — so a
 * wallet can always be rebuilt and funds can never be stranded. This is the
 * backbone of "recover your balance from any device with your phone + PIN".
 *
 * The derivation secret MUST be stable forever (a change re-derives everyone's
 * wallet → strands funds). It defaults to ENCRYPTION_KEY so existing infra works,
 * but set a dedicated WALLET_DERIVATION_SECRET in production and never rotate it.
 */
const DERIVATION_SECRET =
  process.env.WALLET_DERIVATION_SECRET ?? process.env.ENCRYPTION_KEY ?? '';

export function deriveKeypairFromPhone(phone: string): { publicKey: string; secretKey: string } {
  if (!DERIVATION_SECRET) throw new Error('WALLET_DERIVATION_SECRET / ENCRYPTION_KEY not configured');
  const seed = crypto
    .createHmac('sha256', DERIVATION_SECRET)
    .update('olomipay-wallet-v1:' + phone.trim())
    .digest(); // exactly 32 bytes — a valid ed25519 raw seed
  const kp = StellarSdk.Keypair.fromRawEd25519Seed(seed);
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

/** Generate a brand-new RANDOM Stellar keypair (legacy / non-recoverable path). */
export function generateKeypair(): { publicKey: string; secretKey: string } {
  const kp = StellarSdk.Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

/** Return the user's Keypair after decrypting their stored secret with their PIN.
 *
 * The owner/admin account is linked directly to the platform wallet, whose secret
 * is stored RAW (an "S…" key) rather than as an encrypted iv:tag:data blob. Detect
 * that case and use it directly so admin swaps/sends work. Callers MUST verify the
 * PIN (verifyPin) before signing — this helper does not re-check it for raw keys. */
export function getUserKeypair(
  encryptedSecret: string,
  pin: string,
  phone: string,
): StellarSdk.Keypair {
  // Platform/admin raw secret key (not an encrypted blob).
  if (typeof encryptedSecret === 'string' && /^S[A-Z2-7]{55}$/.test(encryptedSecret.trim())) {
    return StellarSdk.Keypair.fromSecret(encryptedSecret.trim());
  }
  const secret = decryptSecret(encryptedSecret, pin, phone);
  return StellarSdk.Keypair.fromSecret(secret);
}

/**
 * Auto-refill the XLM gas treasury from the platform's own USDC.
 *
 * Closes the loop so the system is self-sustaining: the platform collects USDC
 * (1% fees + one-time activation reimbursements) in its wallet, and whenever the
 * gas treasury dips below TREASURY_MIN_XLM this swaps a small, capped amount of
 * that USDC → XLM on the Stellar DEX (path payment to self). Users never touch
 * XLM; the treasury tops itself up from revenue automatically.
 *
 * Safe by design: operates only on the platform's OWN funds, only when low,
 * never spends more than TREASURY_MAX_USDC_PER_TOPUP per run, and is a no-op if
 * the platform key is unset or holds no USDC. Best-effort — callers ignore errors.
 */
export async function topUpTreasuryFromUsdc(opts?: { force?: boolean }): Promise<{
  refilled: boolean; reason: string; xlmBefore: number;
  xlmAfter?: number; usdcSpent?: number; hash?: string;
}> {
  const MIN      = Number(process.env.TREASURY_MIN_XLM ?? '50');
  const TARGET   = Number(process.env.TREASURY_TARGET_XLM ?? '200');
  const MAX_USDC = Number(process.env.TREASURY_MAX_USDC_PER_TOPUP ?? '10');

  let platform: StellarSdk.Keypair;
  try { platform = getPlatformKeypair(); }
  catch { return { refilled: false, reason: 'platform key not set', xlmBefore: 0 }; }

  const acct   = await server.loadAccount(platform.publicKey());
  const xlm    = parseFloat(acct.balances.find((b: any) => b.asset_type === 'native')?.balance ?? '0');
  if (!opts?.force && xlm >= MIN) {
    return { refilled: false, reason: 'treasury healthy', xlmBefore: xlm };
  }

  const usdcBal = parseFloat(
    acct.balances.find((b: any) => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER)?.balance ?? '0',
  );
  if (usdcBal <= 0.01) {
    return { refilled: false, reason: 'platform holds no USDC to convert', xlmBefore: xlm };
  }

  // Size the swap: enough to reach TARGET, capped by MAX_USDC and available USDC.
  const needXlm     = Math.max(0, TARGET - xlm);
  const probe       = await getDexQuote({ fromAsset: 'USDC', toAsset: 'XLM', sendAmount: 1 });
  const xlmPerUsdc  = probe.rate || 8;
  const usdcToSpend = Math.min(needXlm / xlmPerUsdc, MAX_USDC, usdcBal);
  if (usdcToSpend < 0.01) return { refilled: false, reason: 'amount too small', xlmBefore: xlm };

  const quote      = await getDexQuote({ fromAsset: 'USDC', toAsset: 'XLM', sendAmount: usdcToSpend });
  const minReceive = quote.expectedReceive * 0.98;   // 2% slippage guard

  const tx = new StellarSdk.TransactionBuilder(acct, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(StellarSdk.Operation.pathPaymentStrictSend({
    sendAsset:   USDC_ASSET,
    sendAmount:  usdcToSpend.toFixed(7),
    destination: platform.publicKey(),   // swap to self
    destAsset:   XLM_ASSET,
    destMin:     minReceive.toFixed(7),
    path:        [],
  })).addMemo(StellarSdk.Memo.text('treasury gas refill')).setTimeout(60).build();
  tx.sign(platform);
  const r = await server.submitTransaction(tx);

  const after    = await server.loadAccount(platform.publicKey());
  const xlmAfter = parseFloat(after.balances.find((b: any) => b.asset_type === 'native')?.balance ?? '0');
  return { refilled: true, reason: 'ok', xlmBefore: xlm, xlmAfter, usdcSpent: usdcToSpend, hash: r.hash };
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
  return publicKey;
}

/**
 * Fully activate a brand-new user wallet so it can hold funds and transact:
 *   1. Ensure the account EXISTS on-ledger (funded with the minimum XLM reserve).
 *        • testnet → Friendbot (free)
 *        • mainnet → platform createAccount with a small sponsored starting balance
 *   2. Establish the USDC trustline — signed by the USER's own key (we have the
 *      PIN at registration), which is the only key allowed to authorise it.
 *
 * Idempotent & non-fatal: safe to re-run; skips steps already done.
 * Call this at registration (we hold the PIN) so the first deposit can land and
 * the user has a little XLM for network fees from day one.
 */
export async function activateUserWallet(params: {
  publicKey:       string;
  encryptedSecret: string;
  pin:             string;
  phone:           string;
}): Promise<{ funded: boolean; trustline: boolean }> {
  const { publicKey, encryptedSecret, pin, phone } = params;

  // ── 1) Ensure the account exists ───────────────────────────────────────────
  const exists = async () => {
    try { await server.loadAccount(publicKey); return true; }
    catch (e: any) { if (e?.response?.status === 404) return false; throw e; }
  };

  let funded = await exists();
  if (!funded) {
    if (IS_TESTNET) {
      await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    } else {
      // Mainnet: platform SPONSORS the new account so the user holds ZERO XLM.
      // One atomic tx creates the account with startingBalance 0, adds the USDC
      // trustline, and ends sponsorship — the platform treasury locks all the
      // reserves. Requires both the platform key (sponsor) and the user key.
      const platform = getPlatformKeypair();
      const signer   = getUserKeypair(encryptedSecret, pin, phone);
      const pAcct    = await server.loadAccount(platform.publicKey());
      const tx = new StellarSdk.TransactionBuilder(pAcct, {
        fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(StellarSdk.Operation.beginSponsoringFutureReserves({
          sponsoredId: publicKey, source: platform.publicKey(),
        }))
        .addOperation(StellarSdk.Operation.createAccount({
          destination: publicKey, startingBalance: '0',
        }))
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: USDC_ASSET, limit: '1000000', source: publicKey,
        }))
        .addOperation(StellarSdk.Operation.endSponsoringFutureReserves({
          source: publicKey,
        }))
        .setTimeout(120).build();
      tx.sign(platform);
      tx.sign(signer);
      await server.submitTransaction(tx);
    }
    // Wait for the account to appear on-ledger (a few seconds)
    for (let i = 0; i < 8 && !funded; i++) {
      await new Promise(r => setTimeout(r, 1500));
      funded = await exists();
    }
  }
  if (!funded) return { funded: false, trustline: false };

  // ── 2) Add the USDC trustline, signed by the USER ──────────────────────────
  const acct  = await server.loadAccount(publicKey);
  const hasTl = acct.balances.some(
    (b: any) => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER,
  );
  if (hasTl) return { funded: true, trustline: true };

  try {
    const signer = getUserKeypair(encryptedSecret, pin, phone);
    const tx = new StellarSdk.TransactionBuilder(acct, {
      fee: StellarSdk.BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
    }).addOperation(StellarSdk.Operation.changeTrust({
      asset: USDC_ASSET, limit: '1000000',
    })).setTimeout(60).build();
    tx.sign(signer);
    await server.submitTransaction(tx);
    return { funded: true, trustline: true };
  } catch (e: any) {
    console.error('[activateUserWallet] trustline failed:', e?.message);
    return { funded: true, trustline: false };
  }
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

// Short-lived balance cache (per address). Horizon round-trips are ~100-500ms;
// caching 15s makes the dashboard feel instant without showing stale money for long.
const balanceCache = new Map<string, { value: WalletBalance; expiry: number }>();
const BALANCE_TTL_MS = 15_000;

export async function getBalance(publicKey: string, opts?: { fresh?: boolean }): Promise<WalletBalance> {
  const cached = balanceCache.get(publicKey);
  if (!opts?.fresh && cached && Date.now() < cached.expiry) return cached.value;

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

    const value = { xlm, usdc };
    balanceCache.set(publicKey, { value, expiry: Date.now() + BALANCE_TTL_MS });
    return value;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      // Account not activated yet
      return { xlm: '0', usdc: '0' };
    }
    // On a transient Horizon error, serve the last known balance if we have one
    if (cached) return cached.value;
    throw err;
  }
}

/** Invalidate the cached balance for an address (call right after a send/receive). */
export function invalidateBalance(publicKey: string): void {
  balanceCache.delete(publicKey);
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

/**
 * On-chain verification helper for reconciliation / verify-before-retry.
 * Scans an account's recent transactions for one whose text memo matches.
 * Returns the transaction hash if found (proof the payment actually landed),
 * or null. Used to detect the "submitted-but-response-lost" divergence.
 */
export async function findTxHashByMemo(publicKey: string, memoText: string, limit = 50): Promise<string | null> {
  try {
    const txs = await server.transactions().forAccount(publicKey).limit(limit).order('desc').call();
    for (const t of txs.records as any[]) {
      if (t.memo_type === 'text' && t.memo === memoText && t.successful) {
        return t.hash as string;
      }
    }
    return null;
  } catch {
    return null; // Horizon unreachable → treat as "unknown", caller decides
  }
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
  const result = await submitWithPlatformFee(tx);   // treasury pays gas → user holds no XLM

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

  const result = await submitWithPlatformFee(tx);   // treasury pays gas → user holds no XLM
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
  const feeXlm      = parseFloat((amountXlm * 0.01).toFixed(7)); // 1% fee
  const netXlm      = parseFloat((amountXlm - feeXlm).toFixed(7));

  // Does the destination account already exist on-ledger?
  let destExists = true;
  try {
    await server.loadAccount(toAddress);
  } catch (e: any) {
    if (e?.response?.status === 404) destExists = false;
    else throw e;
  }

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Main transfer — createAccount if the recipient's wallet isn't activated yet,
  // otherwise a normal payment.
  if (destExists) {
    txBuilder.addOperation(StellarSdk.Operation.payment({
      destination: toAddress,
      asset:       XLM_ASSET,
      amount:      netXlm.toFixed(7),
    }));
  } else {
    // A new account needs at least the 1 XLM base reserve to be created.
    if (netXlm < 1) {
      throw new Error(
        'Recipient wallet is not activated yet. Send at least 1 XLM to activate it, or ask them to fund their wallet first.',
      );
    }
    txBuilder.addOperation(StellarSdk.Operation.createAccount({
      destination:     toAddress,
      startingBalance: netXlm.toFixed(7),
    }));
  }

  // Fee collection (only if fee account is configured, exists, and isn't us)
  if (feeAccount && feeAccount !== publicKey && feeXlm >= 0.0000001) {
    let feeExists = true;
    try { await server.loadAccount(feeAccount); } catch { feeExists = false; }
    if (feeExists) {
      txBuilder.addOperation(StellarSdk.Operation.payment({
        destination: feeAccount,
        asset:       XLM_ASSET,
        amount:      feeXlm.toFixed(7),
      }));
    }
  }

  if (memo) txBuilder.addMemo(StellarSdk.Memo.text(String(memo).slice(0, 28)));
  txBuilder.setTimeout(60);

  const tx = txBuilder.build();
  tx.sign(signer);

  try {
    const result = await server.submitTransaction(tx);
    return result.hash;
  } catch (e: any) {
    // Surface the real Horizon failure so the UI can show something useful
    const codes = e?.response?.data?.extras?.result_codes;
    const reason = codes
      ? `${codes.transaction ?? ''} ${(codes.operations ?? []).join(',')}`.trim()
      : (e?.message ?? 'unknown');
    console.error('[userSendXlm] submit failed:', reason, JSON.stringify(codes ?? {}));
    throw new Error(`XLM transfer failed: ${reason}`);
  }
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
