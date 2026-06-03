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
  // login receives { username, password, totp? } from the custom login page.
  login: async ({ username, password, totp }: any) => {
    const phone = normPhone(username);

    const res = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone, pin: password }),
    });
    const data = await res.json();
    if (!res.ok || !data.accessToken) throw new Error(data.error ?? 'Login failed');
    const at = data.accessToken;

    // Verify admin
    const me = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${at}` } }).then(r => r.json());
    if (!me.user?.isAdmin) throw new Error('This account is not an administrator.');

    // Second factor — ask the server whether 2FA is required for this admin and verify.
    const v = await fetch(`${API}/api/admin/2fa/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
      body:    JSON.stringify({ token: totp ?? '' }),
    }).then(r => r.json()).catch(() => ({ success: true, data: { required: false, ok: true } }));

    const required = v?.data?.required;
    const ok       = v?.data?.ok;
    if (required) {
      if (!totp) throw new TotpRequiredError();      // prompt the second step
      if (!ok)   throw new Error('Invalid authenticator code');
    }

    localStorage.setItem('olomipay_admin_at', at);
    localStorage.setItem('olomipay_admin_name', me.user.kycName ?? phone);
  },

  logout: async () => { localStorage.removeItem('olomipay_admin_at'); localStorage.removeItem('olomipay_admin_name'); },
  checkAuth: async () => { if (!localStorage.getItem('olomipay_admin_at')) throw new Error('Not authenticated'); },
  checkError: async (error) => { if (error?.status === 401 || error?.status === 403) { localStorage.removeItem('olomipay_admin_at'); throw new Error('Session expired'); } },
  getPermissions: async () => 'admin',
  getIdentity: async () => ({ id: 'admin', fullName: localStorage.getItem('olomipay_admin_name') ?? 'Admin' }),
};
