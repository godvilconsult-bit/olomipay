import { useState } from 'react';
import { useLogin, useNotify } from 'react-admin';

/**
 * Staff admin login — username + password. Staff accounts are created by the
 * SUPER_ADMIN; app users (phone + PIN) cannot log in here.
 */
export default function LoginPage() {
  const login  = useLogin();
  const notify = useNotify();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login({ username, password });
    } catch (err: any) {
      notify(err?.message ?? 'Login failed', { type: 'error' });
    } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, marginTop: 6 };
  const label: React.CSSProperties = { fontSize: 13, color: '#475569', fontWeight: 600 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
      <form onSubmit={submit} style={{ background: '#fff', padding: 32, borderRadius: 20, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>OlomiPay Admin</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>Staff sign-in</p>

        <label style={label}>Username
          <input style={field} value={username} onChange={e => setUsername(e.target.value)} placeholder="username" autoFocus autoCapitalize="none" />
        </label>
        <label style={{ ...label, display: 'block', marginTop: 14 }}>Password
          <input style={field} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        </label>

        <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 10, border: 0, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
