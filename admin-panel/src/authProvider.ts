import { AuthProvider } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Admin auth — logs in with phone + PIN against the main API, then verifies the
 * account has isAdmin. Only admins can use this console.
 */
export const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    // username = phone, password = PIN
    let phone = String(username).trim();
    if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
    if (!phone.startsWith('+')) phone = '+255' + phone;

    const res = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone, pin: password }),
    });
    const data = await res.json();
    if (!res.ok || !data.accessToken) throw new Error(data.error ?? 'Login failed');

    // Verify admin
    const me = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    }).then(r => r.json());
    if (!me.user?.isAdmin) throw new Error('This account is not an administrator.');

    localStorage.setItem('olomipay_admin_at', data.accessToken);
    localStorage.setItem('olomipay_admin_name', me.user.kycName ?? phone);
  },

  logout: async () => { localStorage.removeItem('olomipay_admin_at'); localStorage.removeItem('olomipay_admin_name'); },
  checkAuth: async () => { if (!localStorage.getItem('olomipay_admin_at')) throw new Error('Not authenticated'); },
  checkError: async (error) => { if (error?.status === 401 || error?.status === 403) { localStorage.removeItem('olomipay_admin_at'); throw new Error('Session expired'); } },
  getPermissions: async () => 'admin',
  getIdentity: async () => ({ id: 'admin', fullName: localStorage.getItem('olomipay_admin_name') ?? 'Admin' }),
};
