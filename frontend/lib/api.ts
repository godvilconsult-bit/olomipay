/**
 * API client — thin wrapper around fetch with automatic JWT attachment
 * and token refresh logic.
 *
 * All money values from the API are strings or numbers in USDC / TZS units.
 * Never use floating-point arithmetic on them — use the formatters in utils.ts.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ── Token storage (memory only — never localStorage for secret keys) ──────────

let accessToken:  string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken  = access;
  refreshToken = refresh;
  // Refresh token persisted to sessionStorage (survives reload, cleared on tab close)
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('olomipay_rt', refresh);
  }
}

export function clearTokens() {
  accessToken  = null;
  refreshToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('olomipay_rt');
  }
}

export function loadStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('olomipay_rt');
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

async function apiFetch<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuth = false, ...init } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const stored = refreshToken ?? loadStoredRefreshToken();
    if (stored) {
      const refreshed = await tryRefresh(stored);
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        const retryRes = await fetch(`${BASE}${path}`, { ...init, headers });
        if (!retryRes.ok) {
          const err = await retryRes.json().catch(() => ({ error: 'Unknown error' }));
          throw new ApiError(retryRes.status, err.error ?? 'Request failed');
        }
        return retryRes.json();
      }
    }
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/auth/login';
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, err.error ?? 'Request failed');
  }

  return res.json();
}

async function tryRefresh(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken: token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const auth = {
  register: (phone: string, pin: string, name?: string) =>
    apiFetch('/api/auth/register', {
      method: 'POST',
      body:   JSON.stringify({ phone, pin, ...(name ? { name } : {}) }),
      skipAuth: true,
    }),

  login: (phone: string, pin: string) =>
    apiFetch('/api/auth/login', {
      method: 'POST',
      body:   JSON.stringify({ phone, pin }),
      skipAuth: true,
    }),

  me: () => apiFetch('/api/auth/me'),

  logout: () => {
    const rt = refreshToken ?? loadStoredRefreshToken();
    return apiFetch('/api/auth/logout', {
      method: 'POST',
      body:   JSON.stringify({ refreshToken: rt }),
    }).finally(clearTokens);
  },
};

// ── Wallet ─────────────────────────────────────────────────────────────────────

export const wallet = {
  balance: () => apiFetch('/api/wallet/balance'),
  address: () => apiFetch('/api/wallet/address'),
  history: (limit = 20, offset = 0) =>
    apiFetch(`/api/wallet/history?limit=${limit}&offset=${offset}`),
};

// ── M-Pesa ────────────────────────────────────────────────────────────────────

export const mpesa = {
  deposit:  (amountTzs: number) =>
    apiFetch('/api/mpesa/deposit', { method: 'POST', body: JSON.stringify({ amountTzs }) }),

  withdraw: (amountUsdc: number, pin: string) =>
    apiFetch('/api/mpesa/withdraw', { method: 'POST', body: JSON.stringify({ amountUsdc, pin }) }),

  rate: () => apiFetch('/api/mpesa/rate', { skipAuth: true }),
};

// ── Send ──────────────────────────────────────────────────────────────────────

export const send = {
  toAddress: (params: { toAddress: string; amount: number; asset: string; memo?: string; pin: string }) =>
    apiFetch('/api/send/stellar', { method: 'POST', body: JSON.stringify(params) }),

  toPhone: (params: { toPhone: string; amount: number; asset: string; pin: string }) =>
    apiFetch('/api/send/phone', { method: 'POST', body: JSON.stringify(params) }),

  feePreview: (amount: number) => apiFetch(`/api/send/fee-preview?amount=${amount}`),
};

// ── KYC ───────────────────────────────────────────────────────────────────────

export const kyc = {
  submit: (data: { idType: string; idNumber: string; name: string }) =>
    apiFetch('/api/kyc/submit', { method: 'POST', body: JSON.stringify(data) }),

  status: () => apiFetch('/api/kyc/status'),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const admin = {
  stats: () => apiFetch('/api/admin/stats'),
  users: (limit = 20, offset = 0) =>
    apiFetch(`/api/admin/users?limit=${limit}&offset=${offset}`),
};
