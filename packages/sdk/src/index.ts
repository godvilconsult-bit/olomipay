/**
 * @tuma/payments-sdk
 *
 * White-label payment rails SDK.
 * Wraps Tuma's API for easy integration by other fintechs.
 *
 * Usage:
 *   import { TumaClient } from '@tuma/payments-sdk';
 *   const tuma = new TumaClient({ apiKey: 'tuma_...' });
 *   await tuma.send(fromPhone, toPhone, 10, 'USDC');
 */

import axios, { AxiosInstance } from 'axios';
import {
  TumaConfig, SendResult, BalanceResult,
  DepositResult, WithdrawResult, HistoryResult, TumaError,
} from './types';

export * from './types';

const DEFAULT_BASE_URL = 'https://olomipay-production.up.railway.app';

export class TumaClient {
  private http:   AxiosInstance;
  private apiKey: string;
  private env:    string;

  constructor(config: TumaConfig) {
    this.apiKey = config.apiKey;
    this.env    = config.environment ?? 'sandbox';

    this.http = axios.create({
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeout ?? 30_000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type':  'application/json',
        'X-Tuma-SDK':    '1.0.0',
      },
    });

    this.http.interceptors.response.use(
      res => res,
      err => {
        const msg    = err.response?.data?.error ?? err.message;
        const status = err.response?.status;
        throw new TumaError(msg, `HTTP_${status ?? 'UNKNOWN'}`, status);
      }
    );
  }

  /**
   * Send USDC from one phone to another.
   * Both must have Tuma accounts.
   */
  async send(
    fromPhone: string,
    toPhone:   string,
    amount:    number,
    asset:     'USDC' | 'XLM' = 'USDC',
    memo?:     string,
  ): Promise<SendResult> {
    const res = await this.http.post('/api/send/phone', {
      toPhone, amount, asset, memo,
    });
    return { success: res.data.success, hash: res.data.data?.hash, timestamp: new Date().toISOString() };
  }

  /**
   * Initiate M-Pesa STK push deposit for a phone number.
   */
  async deposit(phone: string, amountTzs: number): Promise<DepositResult> {
    const res = await this.http.post('/api/mpesa/stkpush', { phone, amountTzs });
    return {
      success:            res.data.success,
      checkoutRequestId:  res.data.data?.checkoutRequestId,
      message:            res.data.data?.message,
    };
  }

  /**
   * Withdraw to M-Pesa (B2C).
   */
  async withdraw(phone: string, amountTzs: number): Promise<WithdrawResult> {
    const res = await this.http.post('/api/mpesa/withdraw', { phone, amountTzs });
    return {
      success:        res.data.success,
      conversationId: res.data.data?.conversationId,
      message:        res.data.data?.message,
    };
  }

  /**
   * Get USDC + XLM balance for a phone number.
   */
  async getBalance(phone: string): Promise<BalanceResult> {
    const res = await this.http.get(`/api/wallet/balance?phone=${encodeURIComponent(phone)}`);
    return res.data.data?.balance ?? { xlm: '0', usdc: '0' };
  }

  /**
   * Get transaction history for a phone number.
   */
  async getHistory(
    phone:   string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<HistoryResult> {
    const params = new URLSearchParams({
      phone,
      limit:  String(options.limit ?? 20),
      offset: String(options.offset ?? 0),
    });
    const res = await this.http.get(`/api/wallet/history?${params}`);
    return res.data.data ?? { transactions: [], total: 0 };
  }

  /**
   * Get current TZS/USD exchange rate.
   */
  async getRate(): Promise<{ usdToTzs: number; tzsToUsd: number }> {
    const res = await this.http.get('/api/mpesa/rate');
    const rate = res.data.data?.rate ?? 2600;
    return { usdToTzs: rate, tzsToUsd: +(1 / rate).toFixed(8) };
  }
}

// Named exports for tree-shaking
export default TumaClient;
