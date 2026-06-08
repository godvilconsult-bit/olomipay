/**
 * Fonbnk on/off-ramp adapter — TZS mobile money ⇄ USDC on Stellar.
 *
 * Chosen over Yellow Card for the early stage: Fonbnk has no high-volume
 * minimum, supports Tanzania mobile money, and natively settles **Stellar USDC**
 * (so OlomiPay's existing wallet model plugs straight in — no chain bridging).
 *
 * Auth (HMAC-SHA256): sign `${timestampMs}:${endpointWithQuery}` using the
 * BASE64-DECODED clientSecret as the key; send headers:
 *   x-client-id, x-timestamp (ms), x-signature (base64).
 * Docs: https://docs.fonbnk.com
 *
 * Config (non-secret) via env:  FONBNK_ENV (sandbox|production),
 *   FONBNK_NETWORK (default STELLAR), FONBNK_ASSET (default USDC).
 * Secrets via the secrets provider: FONBNK_CLIENT_ID, FONBNK_CLIENT_SECRET.
 *
 * Inert until credentials are set — does not affect existing flows.
 */
import crypto from 'crypto';
import { getSecret } from './secrets';

const ENV     = process.env.FONBNK_ENV ?? 'sandbox';
const BASE    = ENV === 'production' ? 'https://api.fonbnk.com' : 'https://sandbox-api.fonbnk.com';
const NETWORK = process.env.FONBNK_NETWORK ?? 'STELLAR';
const ASSET   = process.env.FONBNK_ASSET   ?? 'USDC';
const COUNTRY = process.env.FONBNK_COUNTRY ?? 'TZ';
const CHANNEL = 'mobile_money';

function creds() {
  return {
    clientId:     getSecret('FONBNK_CLIENT_ID')     ?? '',
    clientSecret: getSecret('FONBNK_CLIENT_SECRET') ?? '',
  };
}

export function isFonbnkConfigured(): boolean {
  const { clientId, clientSecret } = creds();
  return !!(clientId && clientSecret);
}

/** HMAC-SHA256 signature over `${timestamp}:${endpoint}` (endpoint incl. query). */
function sign(endpoint: string, timestamp: string, clientSecret: string): string {
  const key = Buffer.from(clientSecret, 'base64');
  return crypto.createHmac('sha256', key).update(`${timestamp}:${endpoint}`).digest('base64');
}

async function call(method: 'GET' | 'POST', endpoint: string, body?: any): Promise<any> {
  const { clientId, clientSecret } = creds();
  if (!clientId || !clientSecret) throw new Error('Fonbnk not configured');
  const timestamp = Date.now().toString();
  const signature = sign(endpoint, timestamp, clientSecret);

  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      'x-client-id':  clientId,
      'x-timestamp':  timestamp,
      'x-signature':  signature,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? `Fonbnk API ${res.status}`);
  return data;
}

// ── ON-RAMP: TZS mobile money → USDC to the user's Stellar wallet ──────────────

/** Get a quote (quoteId + fee/cashout breakdown) for a deposit of `amount`. */
export async function onrampBestOffer(amount: number, currency: 'local' | 'crypto' = 'local') {
  const q = new URLSearchParams({
    countryIsoCode: COUNTRY, paymentChannel: CHANNEL, network: NETWORK, asset: ASSET,
    amount: String(amount), currency, includeRequiredFields: 'true',
  });
  return call('GET', `/api/onramp/best-offer?${q.toString()}`);
}

/** Create an on-ramp order. USDC is delivered on-chain to `stellarAddress`. */
export async function onrampCreateOrder(p: {
  quoteId: string; email: string; amount: number; currency?: 'local' | 'crypto';
  stellarAddress: string; phone: string; name?: string;
}) {
  return call('POST', '/api/onramp/order/create', {
    quoteId:  p.quoteId,
    email:    p.email,
    network:  NETWORK,
    asset:    ASSET,
    amount:   p.amount,
    currency: p.currency ?? 'local',
    address:  p.stellarAddress,
    extraFields: { phoneNumber: p.phone, ...(p.name ? { name: p.name } : {}) },
  });
  // → { orderId, status, transferInstructions } (STK push / USSD to the payer)
}

/** Mark the user's mobile-money payment as sent → triggers the crypto transfer. */
export async function onrampConfirmOrder(orderId: string) {
  return call('POST', '/api/onramp/order/confirm', { orderId });
}

// ── OFF-RAMP: USDC → TZS to a recipient's mobile money ────────────────────────

export async function offrampBestOffer(amount: number, currency: 'local' | 'crypto' = 'crypto') {
  const q = new URLSearchParams({
    countryIsoCode: COUNTRY, paymentChannel: CHANNEL, network: NETWORK, asset: ASSET,
    amount: String(amount), currency,
  });
  return call('GET', `/api/offramp/best-offer?${q.toString()}`);
}

/** Create an off-ramp order → returns the Fonbnk address to send USDC to. */
export async function offrampCreateOrder(p: {
  quoteId?: string; amount: number; recipientPhone: string; name?: string;
}) {
  return call('POST', '/api/offramp/order/create', {
    network: NETWORK, asset: ASSET, amount: p.amount, currency: 'crypto',
    ...(p.quoteId ? { quoteId: p.quoteId } : {}),
    extraFields: { phoneNumber: p.recipientPhone, ...(p.name ? { name: p.name } : {}) },
  });
  // → { orderId, address }  (send USDC to `address`, then submit the tx hash)
}

/** After sending USDC to the Fonbnk address, submit the Stellar tx hash. */
export async function offrampSubmitTransaction(orderId: string, txHash: string) {
  return call('POST', '/api/offramp/order/transaction', { orderId, transaction: txHash });
}

// ── Webhook verification ──────────────────────────────────────────────────────
// Fonbnk signs the webhook so merchants can reject forgeries.
//   hash = sha256( JSON.stringify(data) + sha256(clientSecret) )
export function verifyFonbnkWebhook(data: any, hash: string): boolean {
  const { clientSecret } = creds();
  if (!clientSecret || !hash) return false;
  const secretHash = crypto.createHash('sha256').update(clientSecret, 'utf8').digest('hex');
  const expected   = crypto.createHash('sha256').update(JSON.stringify(data)).update(secretHash).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash)); } catch { return false; }
}

export const fonbnkConfig = { env: ENV, baseUrl: BASE, network: NETWORK, asset: ASSET, country: COUNTRY };
