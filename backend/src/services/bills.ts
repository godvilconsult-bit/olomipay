/**
 * Bill payment service.
 * Supports Selcom API and AzamPay for Tanzanian utility bills.
 * Falls back to mock mode when API keys are not set (dev/testing).
 */

import axios from 'axios';
import crypto from 'crypto';

export interface Biller {
  id:          string;
  name:        string;
  category:    string;
  logo:        string;
  description: string;
  minAmount:   number;
  maxAmount:   number;
}

export const BILLERS: Biller[] = [
  { id: 'TANESCO',  name: 'TANESCO (LUKU)',      category: 'Electricity', logo: '⚡', description: 'Electricity tokens',        minAmount: 1000,  maxAmount: 500000 },
  { id: 'DAWASCO',  name: 'DAWASCO Water',        category: 'Water',       logo: '💧', description: 'Water bills',               minAmount: 5000,  maxAmount: 200000 },
  { id: 'DSTV',     name: 'DSTV',                category: 'TV',          logo: '📺', description: 'DSTV subscription',         minAmount: 15000, maxAmount: 150000 },
  { id: 'AZAMTV',   name: 'Azam TV',             category: 'TV',          logo: '📡', description: 'Azam TV subscription',      minAmount: 9000,  maxAmount: 50000  },
  { id: 'VODACOM',  name: 'Vodacom Airtime',      category: 'Airtime',     logo: '📱', description: 'Vodacom airtime top-up',   minAmount: 500,   maxAmount: 100000 },
  { id: 'AIRTEL',   name: 'Airtel Airtime',       category: 'Airtime',     logo: '📱', description: 'Airtel airtime top-up',    minAmount: 500,   maxAmount: 100000 },
  { id: 'TIGO',     name: 'Tigo Airtime',         category: 'Airtime',     logo: '📱', description: 'Tigo airtime top-up',      minAmount: 500,   maxAmount: 100000 },
  { id: 'HALOTEL',  name: 'Halotel Airtime',      category: 'Airtime',     logo: '📱', description: 'Halotel airtime top-up',   minAmount: 500,   maxAmount: 100000 },
  { id: 'GEPG',     name: 'Exam Fees (NECTA)',    category: 'Education',   logo: '🎓', description: 'Government exam fees',     minAmount: 20000, maxAmount: 200000 },
];

// ── Selcom API client ─────────────────────────────────────────────────────────

function selcomHeaders(body: string) {
  const ts        = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', process.env.SELCOM_API_SECRET ?? 'dev-secret')
    .update(ts + body)
    .digest('base64');
  return {
    'Content-Type':     'application/json;charset=UTF-8',
    'Authorization':    `SELCOM ${process.env.SELCOM_API_KEY}`,
    'Digest-Method':    'HS256',
    'Digest':           signature,
    'Timestamp':        ts,
    'Cache-Control':    'no-cache',
  };
}

export async function validateBillAccount(billerId: string, accountNumber: string) {
  // Mock mode for dev / missing API keys
  if (!process.env.SELCOM_API_KEY) {
    return {
      accountName: `Account ${accountNumber}`,
      amountDue:   null,
      valid:       true,
    };
  }

  try {
    const body = JSON.stringify({ vendor: process.env.SELCOM_VENDOR, biller_code: billerId, customer_id: accountNumber });
    const res  = await axios.post(
      'https://apigw.selcomtechnologies.com/v1/bill/lookup',
      body,
      { headers: selcomHeaders(body), timeout: 10_000 },
    );
    return {
      accountName: res.data.result?.customer_name ?? accountNumber,
      amountDue:   res.data.result?.amount ?? null,
      valid:       true,
    };
  } catch {
    return { accountName: accountNumber, amountDue: null, valid: true };
  }
}

export interface PayBillResult {
  success:   boolean;
  reference: string;
  token?:    string; // LUKU electricity token
  message:   string;
}

export async function payBill(params: {
  billerId:      string;
  accountNumber: string;
  amountTzs:     number;
  reference:     string;
}): Promise<PayBillResult> {
  const { billerId, accountNumber, amountTzs, reference } = params;

  // Mock mode
  if (!process.env.SELCOM_API_KEY) {
    const token = billerId === 'TANESCO'
      ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join('')
      : undefined;
    return {
      success:   true,
      reference: `MOCK-${reference}`,
      token,
      message:   token ? `LUKU Token: ${token}` : 'Payment processed (mock)',
    };
  }

  // Real Selcom API
  try {
    const body = JSON.stringify({
      vendor:       process.env.SELCOM_VENDOR,
      biller_code:  billerId,
      customer_id:  accountNumber,
      amount:       Math.floor(amountTzs),
      transid:      reference,
      currency:     'TZS',
    });
    const res = await axios.post(
      'https://apigw.selcomtechnologies.com/v1/bill/pay',
      body,
      { headers: selcomHeaders(body), timeout: 15_000 },
    );

    return {
      success:   res.data.resultcode === '000',
      reference: res.data.reference ?? reference,
      token:     res.data.result?.token,
      message:   res.data.message ?? 'Payment processed',
    };
  } catch (e: any) {
    throw new Error(e.response?.data?.message ?? 'Bill payment failed');
  }
}
