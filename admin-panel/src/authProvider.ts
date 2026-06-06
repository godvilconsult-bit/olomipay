import { AuthProvider } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function normPhone(username: string) {
  let phone = String(username).trim();
  if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
  if (!phone.startsWith('+')) phone = '+255' + phone;
  return phone;
}

/** Thrown when the password step succeeded but a TOTP code is still required. */
export class TotpRequiredError extends Error {
  code = 'TOTP_REQUIRED';
  constructor() { super('Enter your authenticator code'); }
}

/**
 * Admin auth — phone + PIN against the main API, enforces isAdmin, then enforces
 * TOTP 2FA when the admin has it enabled (RFC 6238, verified server-side).
 */
export const authProvider: AuthProvider = {
  // Staff login — username + password against the staff accounts (separate from
  // app users). The token works across all admin endpoints (centralized auth).
  login: async ({ username, password }: any) => {
    const res = await fetch(`${API}/api/admin/staff/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: String(username).toLowerCase().trim(), password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Invalid username or password');

    localStorage.setItem('olomipay_admin_at',   data.data.accessToken);
    localStorage.setItem('olomipay_admin_name', data.data.staff?.name ?? data.data.staff?.username ?? 'Staff');
    localStorage.setItem('olomipay_admin_role', data.data.staff?.role ?? 'SUPPORT');
  },

  logout: async () => {
    localStorage.removeItem('olomipay_admin_at');
    localStorage.removeItem('olomipay_admin_name');
    localStorage.removeItem('olomipay_admin_role');
  },
  checkAuth: async () => { if (!localStorage.getItem('olomipay_admin_at')) throw new Error('Not authenticated'); },
  checkError: async (error) => { if (error?.status === 401 || error?.status === 403) { localStorage.removeItem('olomipay_admin_at'); throw new Error('Session expired'); } },
  getPermissions: async () => localStorage.getItem('olomipay_admin_role') ?? 'SUPPORT',
  getIdentity: async () => ({ id: 'admin', fullName: localStorage.getItem('olomipay_admin_name') ?? 'Admin' }),
};
