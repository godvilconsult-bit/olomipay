/**
 * AzamPay aggregator client — one integration reaches M-Pesa (Vodacom),
 * Mixx by Yas (Tigo), Airtel Money and HaloPesa via MNO checkout (STK push).
 *
 * Flow:
 *   1. GenerateToken (cached until expiry) from the authenticator host.
 *   2. POST /azampay/mno/checkout → provider sends the customer an STK prompt.
 *   3. AzamPay POSTs the result to our webhook (/api/payments/callback).
 *
 * Sandbox vs production is chosen by AZAMPAY_ENV (sandbox | production).
 * Required env: AZAMPAY_APP_NAME, AZAMPAY_CLIENT_ID, AZAMPAY_CLIENT_SECRET, AZAMPAY_API_KEY.
 */
import axios from 'axios';
import { PaymentProvider as DbProvider } from '@prisma/client';

const ENV = (process.env.AZAMPAY_ENV ?? 'sandbox').toLowerCase();

const AUTH_BASE = ENV === 'production'
  ? 'https://authenticator.azampay.co.tz'
  : 'https://authenticator-sandbox.azampay.co.tz';
const CHECKOUT_BASE = process.env.AZAMPAY_BASE ?? (ENV === 'production'
  ? 'https://checkout.azampay.co.tz'
  : 'https://sandbox.azampay.co.tz');

// Map our enum → AzamPay provider names.
const PROVIDER_MAP: Partial<Record<DbProvider, string>> = {
  MPESA:       'Mpesa',
  TIGOPESA:    'Tigo',
  AIRTELMONEY: 'Airtel',
  HALOPESA:    'Halopesa',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const res = await axios.post(`${AUTH_BASE}/AppRegistration/GenerateToken`, {
    appName:      process.env.AZAMPAY_APP_NAME,
    clientId:     process.env.AZAMPAY_CLIENT_ID,
    clientSecret: process.env.AZAMPAY_CLIENT_SECRET,
  }, { timeout: 15_000 });

  const token  = res.data?.data?.accessToken;
  const expire = res.data?.data?.expire;
  if (!token) throw new Error('AzamPay token request failed');
  cachedToken = { token, expiresAt: expire ? new Date(expire).getTime() : Date.now() + 3_000_000 };
  return token;
}

/** Trigger an MNO STK-push collection. Throws on hard failure; otherwise PENDING until webhook. */
export async function azampayCheckout(params: {
  phone: string;
  amount: number;
  externalId: string;
  provider: DbProvider;
}): Promise<{ transactionId?: string; message?: string }> {
  const token    = await getToken();
  const provider = PROVIDER_MAP[params.provider] ?? 'Mpesa';
  // AzamPay expects a local MSISDN (0XXXXXXXXX or 255XXXXXXXXX).
  const accountNumber = params.phone.replace(/^\+/, '');

  const res = await axios.post(`${CHECKOUT_BASE}/azampay/mno/checkout`, {
    accountNumber,
    amount:     String(Math.round(params.amount)),
    currency:   'TZS',
    externalId: params.externalId,
    provider,
  }, {
    timeout: 20_000,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-API-Key':   process.env.AZAMPAY_API_KEY ?? '',
      'Content-Type': 'application/json',
    },
  });

  return { transactionId: res.data?.transactionId, message: res.data?.message };
}

export const AZAMPAY_CONFIGURED =
  !!(process.env.AZAMPAY_APP_NAME && process.env.AZAMPAY_CLIENT_ID && process.env.AZAMPAY_CLIENT_SECRET);
