/**
 * mobile operator Daraja API client.
 *
 * Handles Mobile Money prompt (deposit) and B2C (withdrawal) flows.
 * Tanzania Mobile Money uses a different Daraja instance than Kenya — adapt
 * the base URL to https://openapi.mobile money.com/sandbox for Tanzania Vodacom.
 * For the initial MVP we target the Kenya Daraja sandbox which has the
 * widest documentation coverage; swap the base URL for production Tanzania.
 */

import axios from 'axios';

const IS_SANDBOX = (process.env.Mobile Money_ENV ?? 'sandbox') === 'sandbox';

const BASE_URL = IS_SANDBOX
  ? 'https://sandbox.mobile operator.co.ke'
  : 'https://api.mobile operator.co.ke';

// ── Token cache ───────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.Mobile Money_CONSUMER_KEY}:${process.env.Mobile Money_CONSUMER_SECRET}`,
  ).toString('base64');

  const res = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } },
  );

  cachedToken = res.data.access_token as string;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000; // refresh 60 s early
  return cachedToken;
}

// ── Mobile Money prompt (deposit: user pays via phone prompt) ────────────────────────────

export interface StkPushResult {
  merchantRequestId:  string;
  checkoutRequestId:  string;
  responseDescription: string;
}

export async function initiatemobile moneyPush(params: {
  phone:     string; // +255XXXXXXXXX — will be normalised to 255XXXXXXXXX
  amountTzs: number; // whole TZS amount
  reference: string; // OlomiPay transaction ID
  description: string;
}): Promise<StkPushResult> {
  const token = await getAccessToken();

  // Daraja expects phone without leading +
  const phone = params.phone.replace(/^\+/, '');

  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss

  const password = Buffer.from(
    `${process.env.Mobile Money_SHORTCODE}${process.env.Mobile Money_PASSKEY}${timestamp}`,
  ).toString('base64');

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: process.env.Mobile Money_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(params.amountTzs), // Mobile Money requires integer
      PartyA:            phone,
      PartyB:            process.env.Mobile Money_SHORTCODE,
      PhoneNumber:       phone,
      CallBackURL:       process.env.Mobile Money_CALLBACK_URL,
      AccountReference:  params.reference.slice(0, 12), // max 12 chars
      TransactionDesc:   params.description.slice(0, 13), // max 13 chars
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );

  return {
    merchantRequestId:   res.data.MerchantRequestID,
    checkoutRequestId:   res.data.CheckoutRequestID,
    responseDescription: res.data.ResponseDescription,
  };
}

// ── Mobile Money prompt callback payload (from Mobile Money webhook) ──────────────────────────

export interface StkCallbackPayload {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode:        number;      // 0 = success
  resultDesc:        string;
  amount?:           number;
  mpesaReceiptNumber?: string;
  transactionDate?:  string;
  phoneNumber?:      string;
}

export function parseStkCallback(body: any): StkCallbackPayload {
  const stk = body?.Body?.stkCallback;
  const meta = stk?.CallbackMetadata?.Item ?? [];

  function getMeta(name: string) {
    return meta.find((i: any) => i.Name === name)?.Value;
  }

  return {
    merchantRequestId:   stk.MerchantRequestID,
    checkoutRequestId:   stk.CheckoutRequestID,
    resultCode:          stk.ResultCode,
    resultDesc:          stk.ResultDesc,
    amount:              getMeta('Amount'),
    mpesaReceiptNumber:  getMeta('MpesaReceiptNumber'),
    transactionDate:     getMeta('TransactionDate'),
    phoneNumber:         getMeta('PhoneNumber')?.toString(),
  };
}

// ── B2C (withdrawal: send money from business to customer phone) ──────────────

export interface B2CResult {
  conversationId:       string;
  originatorConversationId: string;
  responseDescription:  string;
}

export async function initiateB2C(params: {
  phone:       string; // +255XXXXXXXXX
  amountTzs:   number;
  reference:   string;
  remarks:     string;
}): Promise<B2CResult> {
  const token = await getAccessToken();
  const phone  = params.phone.replace(/^\+/, '');

  const res = await axios.post(
    `${BASE_URL}/mpesa/b2c/v3/paymentrequest`,
    {
      InitiatorName:          process.env.Mobile Money_B2C_INITIATOR_NAME,
      SecurityCredential:     process.env.Mobile Money_B2C_SECURITY_CREDENTIAL,
      CommandID:              'BusinessPayment',
      Amount:                 Math.floor(params.amountTzs),
      PartyA:                 process.env.Mobile Money_SHORTCODE,
      PartyB:                 phone,
      Remarks:                params.remarks.slice(0, 100),
      QueueTimeOutURL:        process.env.Mobile Money_B2C_QUEUE_URL,
      ResultURL:              process.env.Mobile Money_B2C_RESULT_URL,
      Occasion:               params.reference.slice(0, 100),
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );

  return {
    conversationId:            res.data.ConversationID,
    originatorConversationId:  res.data.OriginatorConversationID,
    responseDescription:       res.data.ResponseDescription,
  };
}

// ── Exchange rate helper (TZS ↔ USDC) ─────────────────────────────────────────

let rateCache: { usdToTzs: number; updatedAt: number } | null = null;

export async function getUsdToTzsRate(): Promise<number> {
  // Cache for 5 minutes to avoid hammering the free API tier
  if (rateCache && Date.now() - rateCache.updatedAt < 5 * 60_000) {
    return rateCache.usdToTzs;
  }

  try {
    const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 5000,
    });
    const rate = res.data.rates?.TZS as number;
    if (!rate || rate < 1000) throw new Error('suspicious rate');
    rateCache = { usdToTzs: rate, updatedAt: Date.now() };
    return rate;
  } catch {
    // Fallback to last known rate or hardcoded approximate
    return rateCache?.usdToTzs ?? 2600;
  }
}

export async function tzsToUsdc(amountTzs: number): Promise<number> {
  const rate = await getUsdToTzsRate();
  // USDC is 1:1 with USD
  return amountTzs / rate;
}

export async function usdcToTzs(amountUsdc: number): Promise<number> {
  const rate = await getUsdToTzsRate();
  return amountUsdc * rate;
}
