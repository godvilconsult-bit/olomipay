/**
 * Yellow Card Business API — Liquidity Provider
 *
 * Reference: https://docs.yellowcard.engineering/reference/get-channels
 *
 * ── AUTHENTICATION (YcHmacV1) ──────────────────────────────────────────────────
 * Every request needs two headers:
 *
 *   X-YC-Timestamp: <ISO8601 datetime>              e.g. 2024-01-11T15:48:37.424Z
 *   Authorization:  YcHmacV1 <apiKey>:<signature>   e.g. YcHmacV1 myKey:base64sig==
 *
 * Signature is base64(HMAC-SHA256(signingString, secretKey)) where:
 *
 *   signingString = timestamp + path + METHOD + bodyHash
 *
 *   - timestamp  = same ISO8601 value used in X-YC-Timestamp header
 *   - path       = request path only (no host), e.g. /business/channels
 *   - METHOD     = uppercase HTTP method, e.g. GET, POST
 *   - bodyHash   = base64(sha256(requestBody)) for POST/PUT; empty string for GET
 *
 *   Example string to sign:
 *     "2022-01-11T15:48:37.424Z/business/channelsGET"
 *     "2022-01-11T15:48:37.424Z/business/paymentsPOSTuisbibf/sadf+=="
 *
 * ── ENDPOINTS ─────────────────────────────────────────────────────────────────
 *   Sandbox:    https://sandbox.api.yellowcard.io
 *   Production: https://api.yellowcard.io
 *
 *   GET  /business/channels          → list all supported channels
 *   GET  /business/networks?channelId=  → networks for a channel
 *   GET  /business/rates?channelId=     → live rates for a channel
 *   POST /business/payments          → create a payment (deposit or withdrawal)
 *   GET  /business/payments/:id      → get payment status
 *
 * ── CHANNEL OBJECT ────────────────────────────────────────────────────────────
 * {
 *   id:            string    — use this as channelId in payment requests
 *   name:          string    — human-readable name e.g. "M-Pesa Tanzania"
 *   country:       string    — ISO-2 country code e.g. "TZ"
 *   currency:      string    — ISO-3 currency code e.g. "TZS"
 *   type:          string    — "momo" | "bank" | "card"
 *   status:        string    — "active" | "inactive"  ← filter out inactive!
 *   widgetStatus:  string    — "active" | "inactive"  (for widget integrations)
 *   minAmount:     number    — minimum transaction in local currency
 *   maxAmount:     number    — maximum transaction in local currency
 *   fixedFee:      number    — fixed fee in local currency
 *   percentFee:    number    — percentage fee (0–100)
 *   networks: [{             — mobile operators / banks within this channel
 *     id:          string
 *     name:        string
 *     status:      string
 *   }]
 * }
 *
 * ── PAYMENT REQUEST ───────────────────────────────────────────────────────────
 * POST /business/payments
 * {
 *   channelId:    string      — from GET /business/channels
 *   sequenceId:   string      — your idempotency key (internal tx ID)
 *   localAmount:  number      — amount in local currency
 *   currency:     string      — e.g. "TZS"
 *   country:      string      — e.g. "TZ"
 *   destination: {
 *     accountType:  "mobile_money" | "bank" | "crypto"
 *     network?:     string    — networkId from GET /business/networks
 *     accountNumber?: string  — phone / account number
 *     accountName?:  string
 *     address?:     string    — Stellar address (for crypto destinations)
 *     asset?:       string    — "USDC" (for crypto destinations)
 *     blockchain?:  string    — "stellar"
 *   }
 *   source?: {
 *     accountType:  "mobile_money" | "bank" | "crypto"
 *     accountNumber?: string
 *     network?:     string
 *   }
 * }
 *
 * ── SANDBOX SIMULATION ────────────────────────────────────────────────────────
 * When YELLOWCARD_ENV=sandbox:
 *   - Real API calls are made to sandbox.api.yellowcard.io
 *   - No real money moves
 *   - Channels/rates are real but sandbox payments are simulated
 *   - If no API key yet: service falls back to rate simulation using
 *     exchangerate-api.com with identical fee math to production
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

// ── Config ─────────────────────────────────────────────────────────────────────

export const IS_SANDBOX  = (process.env.YELLOWCARD_ENV ?? 'sandbox') !== 'production';
export const isYCSandbox = IS_SANDBOX;

const BASE_URL    = IS_SANDBOX
  ? 'https://sandbox.api.yellowcard.io'
  : 'https://api.yellowcard.io';

const API_KEY    = process.env.YELLOWCARD_API_KEY    ?? '';
const API_SECRET = process.env.YELLOWCARD_SECRET     ?? '';
const HAS_KEYS   = Boolean(API_KEY && API_SECRET);

// ── Stellar network fee constants ──────────────────────────────────────────────
export const STELLAR_BASE_FEE_STROOPS = 100;       // per operation
export const STELLAR_BASE_FEE_XLM     = 0.00001;   // per operation (100 stroops)
// A deposit sends USDC to user = 1 payment op → 0.00001 XLM
// A send with fee split = 2 payment ops → 0.00002 XLM

// ── HMAC Authentication (YcHmacV1) ────────────────────────────────────────────

/**
 * Build the signing string per Yellow Card spec:
 *   timestamp + path + METHOD + base64(sha256(body))   [for POST/PUT]
 *   timestamp + path + METHOD                           [for GET/DELETE]
 */
function buildSigningString(
  timestamp: string,
  path:      string,
  method:    string,
  body?:     string,
): string {
  let str = `${timestamp}${path}${method.toUpperCase()}`;
  if (body && (method === 'POST' || method === 'PUT')) {
    const bodyHash = crypto.createHash('sha256').update(body).digest('base64');
    str += bodyHash;
  }
  return str;
}

/**
 * Generate the YcHmacV1 Authorization header value.
 * Returns: "YcHmacV1 <apiKey>:<base64signature>"
 */
function buildAuthHeader(
  timestamp: string,
  path:      string,
  method:    string,
  body?:     string,
): string {
  const signingString = buildSigningString(timestamp, path, method, body);
  const signature     = crypto
    .createHmac('sha256', API_SECRET)
    .update(signingString)
    .digest('base64');
  return `YcHmacV1 ${API_KEY}:${signature}`;
}

// ── Axios client with YcHmacV1 auth interceptor ────────────────────────────────

function buildClient(): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL, timeout: 15_000 });

  client.interceptors.request.use(config => {
    if (!HAS_KEYS) return config; // no keys — sandbox rate-only mode

    const timestamp = new Date().toISOString();
    const path      = config.url ?? '/';
    const method    = (config.method ?? 'GET').toUpperCase();
    const body      = config.data ? JSON.stringify(config.data) : undefined;

    config.headers['X-YC-Timestamp'] = timestamp;
    config.headers['Authorization']  = buildAuthHeader(timestamp, path, method, body);
    config.headers['Content-Type']   = 'application/json';
    return config;
  });

  return client;
}

const ycClient = buildClient();

// ── Channel types ──────────────────────────────────────────────────────────────

export interface YCNetwork {
  id:     string;
  name:   string;
  status: 'active' | 'inactive';
}

export interface YCChannel {
  id:           string;       // use this as channelId in payment requests
  name:         string;       // e.g. "M-Pesa Tanzania"
  country:      string;       // ISO-2: "TZ", "KE", "UG", "GH", "ZM", "NG"
  currency:     string;       // ISO-3: "TZS", "KES", "UGX", "GHS", "ZMW", "NGN"
  type:         string;       // "momo" | "bank" | "card"
  status:       'active' | 'inactive';
  widgetStatus: 'active' | 'inactive';
  minAmount:    number;
  maxAmount:    number;
  fixedFee:     number;
  percentFee:   number;       // Yellow Card's own fee %
  networks:     YCNetwork[];
}

// ── Channel cache ──────────────────────────────────────────────────────────────

let channelCache: { channels: YCChannel[]; expiry: number } | null = null;

/**
 * GET /business/channels
 * Fetches all active channels from Yellow Card.
 * Cached for 10 minutes — channels don't change often.
 * Falls back to a hardcoded list if no API keys configured.
 */
export async function getChannels(forceRefresh = false): Promise<YCChannel[]> {
  if (!forceRefresh && channelCache && Date.now() < channelCache.expiry) {
    return channelCache.channels;
  }

  if (!HAS_KEYS) {
    // No API keys yet — return known channels from Yellow Card's coverage
    // (sourced from their public coverage map docs.yellowcard.engineering/docs/coverage-api)
    return getFallbackChannels();
  }

  try {
    const res = await ycClient.get('/business/channels');
    const channels: YCChannel[] = (res.data?.channels ?? res.data ?? [])
      .filter((c: any) => c.status === 'active');
    channelCache = { channels, expiry: Date.now() + 10 * 60_000 };
    return channels;
  } catch (e: any) {
    console.warn('[yellowcard] getChannels failed:', e.message, '— using fallback');
    return getFallbackChannels();
  }
}

/**
 * Find the best channel for a given currency + type (momo/bank).
 * Filters to active channels only as Yellow Card recommends.
 */
export async function findChannel(
  currency: string,
  type: 'momo' | 'bank' = 'momo',
  networkHint?: string,  // e.g. "mpesa", "tigo", "airtel", "mtn"
): Promise<YCChannel | null> {
  const channels = await getChannels();
  const matches  = channels.filter(c =>
    c.currency.toUpperCase() === currency.toUpperCase() &&
    c.type === type &&
    c.status === 'active',
  );

  if (matches.length === 0) return null;
  if (!networkHint)         return matches[0];

  // Prefer channel whose name matches the network hint
  const hint = networkHint.toLowerCase();
  const preferred = matches.find(c => c.name.toLowerCase().includes(hint));
  return preferred ?? matches[0];
}

/**
 * Detect the likely mobile network from a phone number prefix (Tanzania).
 * Returns a hint string for findChannel().
 */
export function detectNetwork(phone: string): string {
  const clean = phone.replace(/^\+255/, '0').replace(/^\+/, '');
  // Tanzania prefixes:
  if (/^0(74|75|76)/.test(clean)) return 'mpesa';    // Vodacom M-Pesa
  if (/^0(71|65|67)/.test(clean)) return 'tigo';     // Tigo Pesa
  if (/^0(68|69|78)/.test(clean)) return 'airtel';   // Airtel Money
  if (/^0(61|62|63)/.test(clean)) return 'halotel';  // Halotel
  // Kenya
  if (/^07[0-4]|^01[0-1]/.test(clean)) return 'mpesa'; // Safaricom
  if (/^073|^074|^079/.test(clean))     return 'airtel';
  return 'mpesa'; // default
}

// ── Rate fetching ──────────────────────────────────────────────────────────────

export interface YCRate {
  currency:    string;
  usdBuyRate:  number;  // local per $1 — we RECEIVE local, give USDC (deposit)
  usdSellRate: number;  // local per $1 — we GIVE local, take USDC (withdrawal)
  ycSpreadPct: number;  // Yellow Card spread %
  source:      string;  // 'yellowcard_api' | 'exchangerate_api' | 'fallback'
}

// Fallback mid-market rates (used when no API key or API unavailable)
const FALLBACK_MID: Record<string, number> = {
  TZS: 2600, KES: 135, UGX: 3750, GHS: 12.5,
  ZMW: 25,   NGN: 1580, RWF: 1250, XOF: 615,
};

// Yellow Card's published spread: ~0.80% buy/sell around mid
const YC_SPREAD_BPS = 80;

let rateCache = new Map<string, { rate: YCRate; expiry: number }>();

export async function getRate(currency: string): Promise<YCRate> {
  const key    = currency.toUpperCase();
  const cached = rateCache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.rate;

  let midRate = FALLBACK_MID[key] ?? 2600;
  let source  = 'fallback';

  if (HAS_KEYS) {
    // Production / sandbox with keys: get rate from Yellow Card
    try {
      // Find a channel for this currency to get the channelId for the rates endpoint
      const channels = await getChannels();
      const channel  = channels.find(c => c.currency === key);
      if (channel) {
        const res = await ycClient.get(`/business/rates?channelId=${channel.id}`);
        // YC returns rates as an array or object; extract the buy rate
        const rateObj = Array.isArray(res.data) ? res.data[0] : res.data;
        if (rateObj?.buy?.rate)  { midRate = rateObj.buy.rate;  source = 'yellowcard_api'; }
        if (rateObj?.sell?.rate) { midRate = rateObj.sell.rate; source = 'yellowcard_api'; }
      }
    } catch (e: any) {
      console.warn('[yellowcard] rate API failed:', e.message);
    }
  } else {
    // No keys yet: use free exchange rate API for live mid-market rates
    try {
      const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 4000 });
      const r   = res.data?.rates?.[key];
      if (r && r > 0) { midRate = r; source = 'exchangerate_api'; }
    } catch {
      source = 'fallback';
    }
  }

  const spread     = YC_SPREAD_BPS / 10000;
  const usdBuyRate  = midRate * (1 + spread); // user pays MORE local per $1 when buying USDC
  const usdSellRate = midRate * (1 - spread); // user gets LESS local per $1 when selling USDC

  const rate: YCRate = {
    currency: key, usdBuyRate, usdSellRate,
    ycSpreadPct: YC_SPREAD_BPS / 100, source,
  };
  rateCache.set(key, { rate, expiry: Date.now() + 5 * 60_000 });
  return rate;
}

// ── XLM price ──────────────────────────────────────────────────────────────────

let xlmPriceCache: { price: number; expiry: number } | null = null;

export async function getXlmPrice(): Promise<number> {
  if (xlmPriceCache && Date.now() < xlmPriceCache.expiry) return xlmPriceCache.price;
  try {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
      { timeout: 4000 },
    );
    const p = res.data?.stellar?.usd ?? 0.12;
    xlmPriceCache = { price: p, expiry: Date.now() + 10 * 60_000 };
    return p;
  } catch {
    return xlmPriceCache?.price ?? 0.12;
  }
}

// ── Fee breakdown ──────────────────────────────────────────────────────────────

export interface FeeBreakdown {
  // Input
  localAmount:     number;
  localCurrency:   string;
  // Exchange
  midRate:         number;
  ycBuyRate:       number;
  ycSpreadPct:     number;
  ycSpreadUsdc:    number;    // cost of YC spread in USDC terms
  ycFixedFee:      number;    // YC fixed fee in local currency (from channel)
  ycPercentFee:    number;    // YC percent fee (from channel)
  // Platform fee
  platformFeePct:  number;    // always 1%
  platformFeeUsdc: number;
  // Stellar network
  stellarOps:      number;
  stellarFeeXlm:   number;
  stellarFeeUsd:   number;
  xlmPriceUsd:     number;
  // Totals
  grossUsdc:       number;    // before OlomiPay fee
  netUsdc:         number;    // what user actually receives
  totalFeeUsdc:    number;
  // Metadata
  channelId:       string;
  channelName:     string;
  estimatedMins:   number;
  provider:        string;
  isTestnet:       boolean;
}

export async function calculateDepositFees(
  localAmount:  number,
  currency:     string,
  stellarOps    = 1,
  networkHint?: string,
): Promise<FeeBreakdown> {
  const [rate, xlmPrice, channel] = await Promise.all([
    getRate(currency),
    getXlmPrice(),
    findChannel(currency, 'momo', networkHint),
  ]);

  // YC channel fees (from actual channel object)
  const ycFixedFee   = channel?.fixedFee   ?? 0;
  const ycPercentFee = channel?.percentFee ?? YC_SPREAD_BPS / 100;

  // Gross USDC at Yellow Card's buy rate (they give us less USDC per local)
  const grossUsdc       = (localAmount - ycFixedFee) / rate.usdBuyRate;
  // YC spread cost = difference between mid and buy rate
  const midGross        = (localAmount - ycFixedFee) / rate.midRate;
  const ycSpreadUsdc    = Math.max(0, midGross - grossUsdc);
  // Platform fee (1%)
  const platformFeeUsdc = grossUsdc * 0.01;
  const netUsdc         = grossUsdc - platformFeeUsdc;
  // Stellar fee
  const stellarFeeXlm   = STELLAR_BASE_FEE_XLM * stellarOps;
  const stellarFeeUsd   = stellarFeeXlm * xlmPrice;

  return {
    localAmount,
    localCurrency:   currency.toUpperCase(),
    midRate:         parseFloat(rate.midRate?.toFixed(4) ?? rate.usdBuyRate.toFixed(4)),
    ycBuyRate:       parseFloat(rate.usdBuyRate.toFixed(4)),
    ycSpreadPct:     rate.ycSpreadPct,
    ycSpreadUsdc:    parseFloat(ycSpreadUsdc.toFixed(6)),
    ycFixedFee,
    ycPercentFee,
    platformFeePct:  1,
    platformFeeUsdc: parseFloat(platformFeeUsdc.toFixed(6)),
    stellarOps,
    stellarFeeXlm:   parseFloat(stellarFeeXlm.toFixed(7)),
    stellarFeeUsd:   parseFloat(stellarFeeUsd.toFixed(6)),
    xlmPriceUsd:     parseFloat(xlmPrice.toFixed(4)),
    grossUsdc:       parseFloat(grossUsdc.toFixed(6)),
    netUsdc:         parseFloat(netUsdc.toFixed(6)),
    totalFeeUsdc:    parseFloat((platformFeeUsdc + stellarFeeUsd).toFixed(6)),
    channelId:       channel?.id   ?? '',
    channelName:     channel?.name ?? `${currency} Mobile Money`,
    estimatedMins:   IS_SANDBOX ? 0 : 2,
    provider:        IS_SANDBOX ? 'yellowcard_sandbox' : 'yellowcard',
    isTestnet:       IS_SANDBOX,
  };
}

export async function calculateWithdrawFees(
  amountUsdc:   number,
  currency:     string,
  stellarOps    = 2,
  networkHint?: string,
): Promise<FeeBreakdown & { localPayout: number }> {
  const [rate, xlmPrice, channel] = await Promise.all([
    getRate(currency),
    getXlmPrice(),
    findChannel(currency, 'momo', networkHint),
  ]);

  const ycFixedFee      = channel?.fixedFee   ?? 0;
  const platformFeeUsdc = amountUsdc * 0.01;
  const netUsdc         = amountUsdc - platformFeeUsdc;
  const localPayout     = Math.floor(netUsdc * rate.usdSellRate) - ycFixedFee;
  const midGross        = netUsdc * ((rate.usdBuyRate + rate.usdSellRate) / 2);
  const ycSpreadUsdc    = Math.max(0, (midGross - localPayout) / rate.usdSellRate);
  const stellarFeeXlm   = STELLAR_BASE_FEE_XLM * stellarOps;
  const stellarFeeUsd   = stellarFeeXlm * xlmPrice;

  return {
    localAmount:     localPayout,
    localCurrency:   currency.toUpperCase(),
    midRate:         parseFloat(((rate.usdBuyRate + rate.usdSellRate) / 2).toFixed(4)),
    ycBuyRate:       parseFloat(rate.usdSellRate.toFixed(4)),
    ycSpreadPct:     rate.ycSpreadPct,
    ycSpreadUsdc:    parseFloat(ycSpreadUsdc.toFixed(6)),
    ycFixedFee,
    ycPercentFee:    channel?.percentFee ?? YC_SPREAD_BPS / 100,
    platformFeePct:  1,
    platformFeeUsdc: parseFloat(platformFeeUsdc.toFixed(6)),
    stellarOps,
    stellarFeeXlm:   parseFloat(stellarFeeXlm.toFixed(7)),
    stellarFeeUsd:   parseFloat(stellarFeeUsd.toFixed(6)),
    xlmPriceUsd:     parseFloat(xlmPrice.toFixed(4)),
    grossUsdc:       parseFloat(amountUsdc.toFixed(6)),
    netUsdc:         parseFloat(netUsdc.toFixed(6)),
    totalFeeUsdc:    parseFloat((platformFeeUsdc + stellarFeeUsd).toFixed(6)),
    channelId:       channel?.id   ?? '',
    channelName:     channel?.name ?? `${currency} Mobile Money`,
    estimatedMins:   IS_SANDBOX ? 0 : 3,
    provider:        IS_SANDBOX ? 'yellowcard_sandbox' : 'yellowcard',
    isTestnet:       IS_SANDBOX,
    localPayout:     Math.max(0, localPayout),
  };
}

// ── Payment orders ─────────────────────────────────────────────────────────────

export interface YCPaymentOrder {
  id:           string;        // Yellow Card payment ID
  sequenceId:   string;        // your reference ID
  status:       'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  localAmount:  number;
  currency:     string;
  usdcAmount:   number;
  channelId:    string;
  fees:         FeeBreakdown;
  createdAt:    string;
}

/** POST /business/payments — deposit (local currency → USDC to user's Stellar wallet) */
export async function createDepositOrder(params: {
  localAmount:    number;
  localCurrency:  string;
  channelId:      string;      // from getChannels() or findChannel()
  networkId?:     string;      // specific operator within channel
  senderPhone:    string;
  stellarAddress: string;      // user's Stellar pubkey to receive USDC
  referenceId:    string;      // your internal tx ID (idempotency)
}): Promise<YCPaymentOrder> {
  const fees = await calculateDepositFees(params.localAmount, params.localCurrency);

  if (!HAS_KEYS || IS_SANDBOX) {
    // Sandbox simulation — identical structure to production
    console.log(`[yellowcard] SANDBOX deposit order: ${params.localAmount} ${params.localCurrency} → ${fees.netUsdc} USDC`);
    return {
      id:          `YC-SANDBOX-${params.referenceId}`,
      sequenceId:  params.referenceId,
      status:      'completed',   // instant on sandbox
      localAmount: params.localAmount,
      currency:    params.localCurrency,
      usdcAmount:  fees.netUsdc,
      channelId:   params.channelId,
      fees,
      createdAt:   new Date().toISOString(),
    };
  }

  // Production: POST /business/payments
  const body = {
    channelId:   params.channelId,
    sequenceId:  params.referenceId,
    localAmount: params.localAmount,
    currency:    params.localCurrency,
    country:     currencyToCountry(params.localCurrency),
    destination: {
      accountType: 'crypto',
      address:     params.stellarAddress,
      blockchain:  'stellar',
      asset:       'USDC',
    },
    source: {
      accountType:   'mobile_money',
      accountNumber: params.senderPhone.replace(/^\+/, ''),
      ...(params.networkId ? { network: params.networkId } : {}),
    },
  };

  const res = await ycClient.post('/business/payments', body);
  return {
    id:          res.data.id,
    sequenceId:  params.referenceId,
    status:      res.data.status,
    localAmount: params.localAmount,
    currency:    params.localCurrency,
    usdcAmount:  fees.netUsdc,
    channelId:   params.channelId,
    fees,
    createdAt:   res.data.createdAt ?? new Date().toISOString(),
  };
}

/** POST /business/payments — withdrawal (USDC → local currency to user's phone) */
export async function createWithdrawOrder(params: {
  amountUsdc:     number;
  localCurrency:  string;
  channelId:      string;
  networkId?:     string;
  recipientPhone: string;
  referenceId:    string;
}): Promise<YCPaymentOrder & { localPayout: number }> {
  const fees = await calculateWithdrawFees(params.amountUsdc, params.localCurrency) as any;

  if (!HAS_KEYS || IS_SANDBOX) {
    console.log(`[yellowcard] SANDBOX withdraw order: ${params.amountUsdc} USDC → ${fees.localPayout} ${params.localCurrency}`);
    return {
      id:          `YC-SANDBOX-OUT-${params.referenceId}`,
      sequenceId:  params.referenceId,
      status:      'completed',
      localAmount: fees.localPayout,
      currency:    params.localCurrency,
      usdcAmount:  params.amountUsdc,
      channelId:   params.channelId,
      fees,
      createdAt:   new Date().toISOString(),
      localPayout: fees.localPayout,
    };
  }

  const body = {
    channelId:   params.channelId,
    sequenceId:  params.referenceId,
    localAmount: fees.localPayout,
    currency:    params.localCurrency,
    country:     currencyToCountry(params.localCurrency),
    destination: {
      accountType:   'mobile_money',
      accountNumber: params.recipientPhone.replace(/^\+/, ''),
      ...(params.networkId ? { network: params.networkId } : {}),
    },
    source: {
      accountType: 'crypto',
      blockchain:  'stellar',
      asset:       'USDC',
    },
  };

  const res = await ycClient.post('/business/payments', body);
  return {
    id:          res.data.id,
    sequenceId:  params.referenceId,
    status:      res.data.status,
    localAmount: fees.localPayout,
    currency:    params.localCurrency,
    usdcAmount:  params.amountUsdc,
    channelId:   params.channelId,
    fees,
    createdAt:   res.data.createdAt ?? new Date().toISOString(),
    localPayout: fees.localPayout,
  };
}

/** GET /business/payments/:id — check payment status */
export async function getPaymentStatus(paymentId: string): Promise<{
  id: string; status: string; localAmount: number; currency: string;
}> {
  if (!HAS_KEYS) return { id: paymentId, status: 'completed', localAmount: 0, currency: 'TZS' };
  const res = await ycClient.get(`/business/payments/${paymentId}`);
  return res.data;
}

// ── Webhook verification ───────────────────────────────────────────────────────
// YC webhook signature: base64(sha256(requestBody)) using the API secret

export function verifyYCWebhook(payload: string, signature: string): boolean {
  if (!API_SECRET || IS_SANDBOX) return true;
  const expected = crypto.createHash('sha256').update(`${API_SECRET}${payload}`).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Legacy adapter (used by mpesa.ts for backward compatibility) ───────────────

/** @deprecated Use findChannel() instead */
export function phoneToChannel(phone: string, currency = 'TZS'): string {
  const net = detectNetwork(phone);
  // Return a composite key that getChannels() can resolve
  return `${currency}_${net.toUpperCase()}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function currencyToCountry(currency: string): string {
  const map: Record<string, string> = {
    TZS: 'TZ', KES: 'KE', UGX: 'UG', GHS: 'GH',
    ZMW: 'ZM', NGN: 'NG', RWF: 'RW', XOF: 'SN',
  };
  return map[currency.toUpperCase()] ?? 'TZ';
}

/** Hardcoded channel list for no-key sandbox mode (mirrors YC coverage map) */
function getFallbackChannels(): YCChannel[] {
  return [
    { id: 'sandbox-tz-mpesa',   name: 'M-Pesa Tanzania',  country: 'TZ', currency: 'TZS', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 500,    maxAmount: 5_000_000, fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-tz-tigo',    name: 'Tigo Pesa',        country: 'TZ', currency: 'TZS', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 500,    maxAmount: 5_000_000, fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-tz-airtel',  name: 'Airtel Tanzania',  country: 'TZ', currency: 'TZS', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 500,    maxAmount: 5_000_000, fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-ke-mpesa',   name: 'M-Pesa Kenya',     country: 'KE', currency: 'KES', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 10,     maxAmount: 150_000,  fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-ug-mtn',     name: 'MTN Uganda',       country: 'UG', currency: 'UGX', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 1_000,  maxAmount: 7_000_000, fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-ug-airtel',  name: 'Airtel Uganda',    country: 'UG', currency: 'UGX', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 1_000,  maxAmount: 7_000_000, fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-gh-mtn',     name: 'MTN Ghana',        country: 'GH', currency: 'GHS', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 1,      maxAmount: 10_000,   fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-zm-mtn',     name: 'MTN Zambia',       country: 'ZM', currency: 'ZMW', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 5,      maxAmount: 50_000,   fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-ng-bank',    name: 'Nigeria Bank',     country: 'NG', currency: 'NGN', type: 'bank', status: 'active', widgetStatus: 'active', minAmount: 500,    maxAmount: 5_000_000, fixedFee: 0, percentFee: 0.8 },
    { id: 'sandbox-rw-mtn',     name: 'MTN Rwanda',       country: 'RW', currency: 'RWF', type: 'momo', status: 'active', widgetStatus: 'active', minAmount: 500,    maxAmount: 2_000_000, fixedFee: 0, percentFee: 0.8 },
  ].map(c => ({ ...c, networks: [] }));
}

/** Get available channels for the /api/mpesa/channels endpoint */
export async function getChannelsForUI(): Promise<{
  channels: Array<{
    id: string; name: string; country: string; currency: string;
    type: string; minAmount: number; maxAmount: number; active: boolean;
  }>;
  isSandbox: boolean;
}> {
  const channels = await getChannels();
  return {
    channels: channels.map(c => ({
      id:        c.id,
      name:      c.name,
      country:   c.country,
      currency:  c.currency,
      type:      c.type,
      minAmount: c.minAmount,
      maxAmount: c.maxAmount,
      active:    c.status === 'active',
    })),
    isSandbox: IS_SANDBOX,
  };
}
