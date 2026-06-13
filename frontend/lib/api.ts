/**
 * JIKO CONNECT API client — fetch wrapper with JWT attach + auto-refresh.
 * All money values are TZS integers.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type Role = 'HOUSEHOLD' | 'SUPPLIER' | 'RIDER' | 'ADMIN';

export interface JikoUser {
  id: string;
  phone: string;
  role: Role;
  name?: string | null;
  region?: string | null;
  kycStatus: string;
  supplierProfile?: { id: string; businessName: string; isOpen: boolean; isVerified: boolean; tier: string } | null;
  riderProfile?: { id: string; vehicleType: string; status: string; isVerified: boolean; rating: number; totalDeliveries: number } | null;
}

let accessToken:  string | null = null;
let refreshToken: string | null = null;

const COOKIE = 'jiko_session';
const SESSION_DAYS = 180;

function writeSessionCookie() {
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toUTCString();
  document.cookie = `${COOKIE}=1; path=/; expires=${expires}; SameSite=Lax`;
}

if (typeof window !== 'undefined') {
  accessToken  = localStorage.getItem('jiko_at');
  refreshToken = localStorage.getItem('jiko_rt');
  if (accessToken || refreshToken) writeSessionCookie();
}

export function setTokens(access: string, refresh: string) {
  accessToken = access; refreshToken = refresh;
  if (typeof window !== 'undefined') {
    localStorage.setItem('jiko_at', access);
    localStorage.setItem('jiko_rt', refresh);
    writeSessionCookie();
  }
}

export function clearTokens() {
  accessToken = null; refreshToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('jiko_at');
    localStorage.removeItem('jiko_rt');
    document.cookie = `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

export function getAccessToken(): string | null {
  return accessToken ?? (typeof window !== 'undefined' ? localStorage.getItem('jiko_at') : null);
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}

interface Opts extends RequestInit { skipAuth?: boolean }

async function apiFetch<T = any>(path: string, options: Opts = {}): Promise<T> {
  const { skipAuth = false, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (!skipAuth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !skipAuth) {
    const stored = refreshToken ?? (typeof window !== 'undefined' ? localStorage.getItem('jiko_rt') : null);
    if (stored && await tryRefresh(stored)) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      const retry = await fetch(`${BASE}${path}`, { ...init, headers });
      if (!retry.ok) throw new ApiError(retry.status, (await retry.json().catch(() => ({}))).error ?? 'Request failed');
      return retry.json();
    }
    clearTokens();
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (!(p === '/' || p.startsWith('/auth/'))) window.location.href = '/auth/login';
    }
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? 'Request failed');
  return res.json();
}

async function tryRefresh(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch { return false; }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const auth = {
  register: (body: { phone: string; pin: string; role: Role; name?: string; region?: string; businessName?: string; vehicleType?: string }) =>
    apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
  login: (phone: string, pin: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, pin }), skipAuth: true }),
  me: () => apiFetch<{ user: JikoUser }>('/api/auth/me'),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).finally(clearTokens),
};

export const addresses = {
  list:    () => apiFetch('/api/addresses'),
  create:  (body: any) => apiFetch('/api/addresses', { method: 'POST', body: JSON.stringify(body) }),
  current: (body: { lat: number; lng: number; label?: string; region?: string; district?: string; ward?: string }) =>
    apiFetch<{ address: any }>('/api/addresses/current', { method: 'POST', body: JSON.stringify(body) }),
  setDefault: (id: string) => apiFetch(`/api/addresses/${id}/default`, { method: 'POST' }),
  remove:  (id: string) => apiFetch(`/api/addresses/${id}`, { method: 'DELETE' }),
};

export const vendors = {
  products: () => apiFetch('/api/vendors/products'),
  search:   (q: { lat: number; lng: number; brand?: string; type?: string; sizeKg?: number; radiusKm?: number }) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return apiFetch(`/api/vendors/search?${params.toString()}`);
  },
  get: (id: string) => apiFetch(`/api/vendors/${id}`),
};

export const orders = {
  place:   (body: { supplierId: string; addressId: string; items: { inventoryId: string; qty: number }[]; note?: string }) =>
    apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  list:    () => apiFetch('/api/orders'),
  get:     (id: string) => apiFetch(`/api/orders/${id}`),
  reorder: (id: string) => apiFetch(`/api/orders/${id}/reorder`, { method: 'POST' }),
  cancel:  (id: string) => apiFetch(`/api/orders/${id}/cancel`, { method: 'POST' }),
  confirmFee: (id: string) => apiFetch(`/api/orders/${id}/confirm-fee`, { method: 'POST' }),
  complete:(id: string) => apiFetch(`/api/orders/${id}/complete`, { method: 'POST' }),
  review:  (id: string, body: { supplierRating?: number; riderRating?: number; comment?: string }) =>
    apiFetch(`/api/orders/${id}/review`, { method: 'POST', body: JSON.stringify(body) }),
  pay:     (id: string, body: { phone?: string; provider?: string }) =>
    apiFetch(`/api/payments/${id}/initiate`, { method: 'POST', body: JSON.stringify(body) }),
};

export const jobs = {
  online:      (lat?: number, lng?: number) => apiFetch('/api/jobs/online', { method: 'POST', body: JSON.stringify({ lat, lng }) }),
  offline:     () => apiFetch('/api/jobs/offline', { method: 'POST' }),
  offers:      () => apiFetch('/api/jobs/offers'),
  acceptOffer: (orderId: string) => apiFetch(`/api/jobs/${orderId}/accept-offer`, { method: 'POST' }),
  declineOffer:(orderId: string) => apiFetch(`/api/jobs/${orderId}/decline-offer`, { method: 'POST' }),
  pick:        (orderId: string) => apiFetch(`/api/jobs/${orderId}/pick`, { method: 'POST' }),
  deliver:     (orderId: string, otp: string) => apiFetch(`/api/jobs/${orderId}/deliver`, { method: 'POST', body: JSON.stringify({ otp }) }),
  active:      () => apiFetch('/api/jobs/active'),
  earnings:    () => apiFetch('/api/jobs/earnings'),
  setProfile:  (body: { photoUrl?: string; plateNo?: string; vehicleType?: string }) => apiFetch('/api/jobs/profile', { method: 'PUT', body: JSON.stringify(body) }),
};

export const suppliers = {
  me:        () => apiFetch('/api/suppliers/me'),
  update:    (body: any) => apiFetch('/api/suppliers/me', { method: 'PUT', body: JSON.stringify(body) }),
  inventory: () => apiFetch('/api/suppliers/inventory'),
  setInventory: (body: { productId: string; price: number; stock: number; isAvailable?: boolean }) =>
    apiFetch('/api/suppliers/inventory', { method: 'POST', body: JSON.stringify(body) }),
  orders:      () => apiFetch('/api/suppliers/orders'),
  accept:      (id: string) => apiFetch(`/api/suppliers/${id}/accept`, { method: 'POST' }),
  reject:      (id: string) => apiFetch(`/api/suppliers/${id}/reject`, { method: 'POST' }),
  ridersNearby:() => apiFetch('/api/suppliers/riders/nearby'),
  assignRider: (orderId: string, riderId: string) => apiFetch(`/api/suppliers/${orderId}/assign-rider`, { method: 'POST', body: JSON.stringify({ riderId }) }),
  restockList: () => apiFetch('/api/suppliers/restock'),
  restock:   (body: { productId?: string; distributor?: string; qty: number; note?: string }) =>
    apiFetch('/api/suppliers/restock', { method: 'POST', body: JSON.stringify(body) }),
  payouts:   () => apiFetch('/api/suppliers/payouts'),
  upgradeRequest: (tier: 'STANDARD' | 'PREMIUM') => apiFetch('/api/suppliers/upgrade-request', { method: 'POST', body: JSON.stringify({ tier }) }),
};

// Wallet / ledger (riders + suppliers)
export interface WalletTxn { id: string; type: string; amount: number; balanceAfter: number; note?: string | null; orderId?: string | null; createdAt: string }
export const wallet = {
  get:     () => apiFetch<{ balance: number; currency: string; txns: WalletTxn[]; pendingCashouts: any[] }>('/api/wallet'),
  cashout: (body: { amount: number; phone?: string; provider?: string }) => apiFetch('/api/wallet/cashout', { method: 'POST', body: JSON.stringify(body) }),
  settle:  () => apiFetch<{ ok: boolean; balance: number; settled: number }>('/api/wallet/settle', { method: 'POST' }),
};

// Brand ads (Phase 3) — sponsored placements on the household home.
export const ads = {
  active: (region?: string) => apiFetch<{ ad: BrandAd | null }>(`/api/ads/active${region ? `?region=${encodeURIComponent(region)}` : ''}`),
  click:  (id: string) => apiFetch(`/api/ads/${id}/click`, { method: 'POST' }),
};
export interface BrandAd { id: string; brand: string; title: string; subtitle?: string | null; imageUrl?: string | null; ctaLabel?: string | null; type?: string | null }

export const adminApi = {
  stats:      () => apiFetch('/api/admin/stats'),
  users:      (role?: string) => apiFetch(`/api/admin/users${role ? `?role=${role}` : ''}`),
  orders:     () => apiFetch('/api/admin/orders'),
  kycPending: () => apiFetch('/api/admin/kyc'),
  kyc:        (userId: string, status: 'APPROVED' | 'REJECTED') => apiFetch(`/api/admin/kyc/${userId}`, { method: 'POST', body: JSON.stringify({ status }) }),
  deleteUser: (userId: string) => apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  // Phase 2 — supplier plans + featured slots
  suppliers:  () => apiFetch<{ suppliers: any[] }>('/api/admin/suppliers'),
  setTier:    (id: string, body: { tier?: 'FREE' | 'STANDARD' | 'PREMIUM'; featured?: boolean }) => apiFetch(`/api/admin/suppliers/${id}/tier`, { method: 'POST', body: JSON.stringify(body) }),
  // Phase 3 — brand ads
  ads:        () => apiFetch<{ ads: any[] }>('/api/admin/ads'),
  createAd:   (body: { brand: string; title: string; subtitle?: string; imageUrl?: string; ctaLabel?: string; region?: string; type?: string; weight?: number }) => apiFetch('/api/admin/ads', { method: 'POST', body: JSON.stringify(body) }),
  patchAd:    (id: string, body: { isActive?: boolean; weight?: number }) => apiFetch(`/api/admin/ads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAd:   (id: string) => apiFetch(`/api/admin/ads/${id}`, { method: 'DELETE' }),
  // T1 — cash-out disbursements
  cashouts:     () => apiFetch<{ requests: any[] }>('/api/admin/cashouts'),
  payCashout:   (id: string, ref?: string) => apiFetch(`/api/admin/cashouts/${id}/paid`, { method: 'POST', body: JSON.stringify({ ref }) }),
  rejectCashout:(id: string) => apiFetch(`/api/admin/cashouts/${id}/reject`, { method: 'POST' }),
};

export const notifications = {
  list:    () => apiFetch<{ notifications: any[]; unread: number }>('/api/notifications'),
  readAll: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),
  read:    (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'POST' }),
  vapid:     () => apiFetch<{ publicKey: string | null }>('/api/notifications/vapid'),
  subscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) => apiFetch('/api/notifications/subscribe', { method: 'POST', body: JSON.stringify(body) }),
};

export const kyc = {
  status: () => apiFetch<{ kycStatus: string; submitted: boolean; kycName?: string }>('/api/kyc/status'),
  submit: (body: { name: string; idType: string; idNumber: string; selfieUrl: string; idUrl: string; plateNo?: string; vehicleType?: string; businessName?: string; description?: string; payProvider?: string; payNumber?: string; payName?: string }) =>
    apiFetch('/api/kyc/submit', { method: 'POST', body: JSON.stringify(body) }),
};
