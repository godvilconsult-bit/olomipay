export interface TumaConfig {
  apiKey:      string;
  baseUrl?:    string;
  timeout?:    number;
  environment?: 'sandbox' | 'production';
}

export interface SendResult {
  success:    boolean;
  hash?:      string;
  error?:     string;
  timestamp:  string;
}

export interface BalanceResult {
  xlm:  string;
  usdc: string;
}

export interface DepositResult {
  success:        boolean;
  checkoutRequestId?: string;
  message?:       string;
  error?:         string;
}

export interface WithdrawResult {
  success:        boolean;
  conversationId?: string;
  message?:       string;
  error?:         string;
}

export interface Transaction {
  id:         string;
  type:       string;
  status:     string;
  amountUsdc?: number;
  amountTzs?: number;
  createdAt:  string;
  memo?:      string;
}

export interface HistoryResult {
  transactions: Transaction[];
  total:        number;
}

export class TumaError extends Error {
  code:    string;
  status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name   = 'TumaError';
    this.code   = code;
    this.status = status;
  }
}
