/**
 * M-Pesa / Daraja API client.
 *
 * Handles STK Push (deposit) and B2C (withdrawal) flows.
 * Supports both Kenya Safaricom sandbox and Tanzania Vodacom.
 * Switch MPESA_ENV=production and update BASE_URL for live.
 */

import axios from 'axios';

const IS_SANDBOX = (process.env.MPESA_ENV ?? 'sandbox') === 'sandbox';

const BASE_URL = IS_SANDBOX
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke';

// ── OAuth token cache ─────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
  ).toString('base64');

  const res = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` }, timeout: 10_000 },
  );

  cachedToken = res.data.access_token as string;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── STK Push (deposit — triggers payment prompt on user's phone) ──────────────

export interface StkPushResult {
  merchantRequestId:   string;
  checkoutRequestId:   string;
  responseDescription: string;
}

export async function initiatemobile_moneyPush(params: {
  phone:       string;  // +255XXXXXXXXX
  amountTzs:   number;  // whole integer TZS
  reference:   string;  // internal tx ID
  description: string;
}): Promise<StkPushResult> {
  const token = await getAccessToken();
  const phone = params.phone.replace(/^\+/, '');

  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss

  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`,
  ).toString('base64');

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(params.amountTzs),
      PartyA:            phone,
      PartyB:            process.env.MPESA_SHORTCODE,
      PhoneNumber:       phone,
      CallBackURL:       process.env.MPESA_CALLBACK_URL,
      AccountReference:  params.reference.slice(0, 12),
      TransactionDesc:   params.description.slice(0, 13),
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 },
  );

  return {
    merchantRequestId:   res.data.MerchantRequestID,
    checkoutRequestId:   res.data.CheckoutRequestID,
    responseDescription: res.data.ResponseDescription,
  };
}

// ── STK Push callback parser ───────────────────────────────────────────────────

export interface StkCallbackPayload {
  merchantRequestId:   string;
  checkoutRequestId:   string;
  resultCode:          number;   // 0 = success
  resultDesc:          string;
  amount?:             number;
  mpesaReceiptNumber?: string;
  transactionDate?:    string;
  phoneNumber?:        string;
}

export function parseStkCallback(body: any): StkCallbackPayload {
  const stk  = body?.Body?.stkCallback;
  const meta = stk?.CallbackMetadata?.Item ?? [];

  const getMeta = (name: string) =>
    meta.find((i: any) => i.Name === name)?.Value;

  return {
    merchantRequestId:   stk?.MerchantRequestID ?? '',
    checkoutRequestId:   stk?.CheckoutRequestID  ?? '',
    resultCode:          stk?.ResultCode          ?? 1,
    resultDesc:          stk?.ResultDesc          ?? 'Unknown',
    amount:              getMeta('Amount'),
    mpesaReceiptNumber:  getMeta('MpesaReceiptNumber'),
    transactionDate:     getMeta('TransactionDate'),
    phoneNumber:         getMeta('PhoneNumber')?.toString(),
  };
}

// ── B2C — send money from business to customer phone (withdrawal) ─────────────

export interface B2CResult {
  conversationId:          string;
  originatorConversationId: string;
  responseDescription:     string;
}

export async function initiateB2C(params: {
  phone:     string;  // +255XXXXXXXXX
  amountTzs: number;
  reference: string;
  remarks:   string;
}): Promise<B2CResult> {
  const token = await getAccessToken();
  const phone = params.phone.replace(/^\+/, '');

  const res = await axios.post(
    `${BASE_URL}/mpesa/b2c/v3/paymentrequest`,
    {
      InitiatorName:      process.env.MPESA_B2C_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
      CommandID:          'BusinessPayment',
      Amount:             Math.floor(params.amountTzs),
      PartyA:             process.env.MPESA_SHORTCODE,
      PartyB:             phone,
      Remarks:            params.remarks.slice(0, 100),
      QueueTimeOutURL:    process.env.MPESA_B2C_QUEUE_URL,
      ResultURL:          process.env.MPESA_B2C_RESULT_URL,
      Occasion:           params.reference.slice(0, 100),
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 },
  );

  return {
    conversationId:           res.data.ConversationID,
    originatorConversationId: res.data.OriginatorConversationID,
    responseDescription:      res.data.ResponseDescription,
  };
}

// ── Exchange rate (TZS ↔ USD) ──────────────────────────────────────────────────

let rateCache: { usdToTzs: number; updatedAt: number } | null = null;

export async function getUsdToTzsRate(): Promise<number> {
  if (rateCache && Date.now() - rateCache.updatedAt < 5 * 60_000) {
    return rateCache.usdToTzs;
  }
  try {
    const res  = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 });
    const rate = res.data.rates?.TZS as number;
    if (!rate || rate < 1000) throw new Error('suspicious rate');
    rateCache = { usdToTzs: rate, updatedAt: Date.now() };
    return rate;
  } catch {
    return rateCache?.usdToTzs ?? 2600;
  }
}

export async function tzsToUsdc(amountTzs: number): Promise<number> {
  return amountTzs / (await getUsdToTzsRate());
}

export async function usdcToTzs(amountUsdc: number): Promise<number> {
  return amountUsdc * (await getUsdToTzsRate());
}
